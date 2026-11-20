"""Explicit Party database operations. Never reads application config or environment."""
import argparse
import configparser
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / 'gierkoteka/party/setup.sql'
IDENTIFIER = re.compile(r'^[A-Za-z0-9_]+$')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


class Database:
    def __init__(self, defaults_file, database, client_bin):
        require(bool(IDENTIFIER.fullmatch(database)), 'Invalid database name.')
        self.name = database
        self.defaults = Path(defaults_file).resolve()
        config = configparser.ConfigParser(interpolation=None)
        config.read(self.defaults, encoding='utf-8')
        require(config.sections() == ['client'] and not config.defaults(),
                'Provide an explicit defaults file with only [client].')
        require(set(config['client']) <= {'host', 'port', 'user', 'password', 'protocol'},
                'Unsupported client option; use a dedicated minimal defaults file.')
        self.host = config['client'].get('host', '')
        self.port = config['client'].get('port', '')
        require(self.host and self.port.isdigit() and 0 < int(self.port) < 65536,
                'Explicit host and TCP port are required.')
        require(config['client'].get('user'), 'Explicit user is required.')
        self.client_bin = Path(client_bin)

    def run(self, executable, arguments, sql=None):
        command = [str(self.client_bin / executable), '--defaults-file=' + str(self.defaults),
                   '--protocol=tcp', '--host=' + self.host, '--port=' + self.port,
                   '--default-character-set=utf8mb4'] + arguments
        result = subprocess.run(command, input=sql, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        # Client diagnostics may include configuration or SQL contents. Do not print them.
        require(result.returncode == 0, executable + ' failed; operation stopped (diagnostics suppressed).')
        return result.stdout

    def sql(self, sql, database=True):
        args = ['--batch', '--skip-column-names', '--binary-mode']
        if database:
            args += ['--database=' + self.name]
        return self.run('mysql', args, sql.encode('utf-8')).decode('utf-8').strip()

    def dump(self, output):
        self.run('mysqldump', [
            '--single-transaction', '--quick', '--routines', '--events', '--triggers',
            '--hex-blob', '--complete-insert', '--order-by-primary', '--skip-extended-insert',
            '--skip-comments', '--skip-add-locks', '--skip-disable-keys', '--skip-add-drop-table',
            '--result-file=' + str(output), self.name,
        ])
        require(output.is_file() and output.stat().st_size > 0, 'Empty backup.')

    def identity(self):
        return {'host': self.host, 'port': self.port, 'database': self.name}


def read_backup(directory):
    directory = Path(directory)
    manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8'))
    require(digest(directory / 'database.sql') == manifest['sha256'], 'Backup checksum mismatch.')
    return directory, manifest


def backup(db, args):
    require(args.maintenance_confirmed, 'Stop all writers and DDL; pass --maintenance-confirmed.')
    engines = db.sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() "
                     "AND TABLE_TYPE='BASE TABLE' AND ENGINE <> 'InnoDB'")
    require(not engines, 'Non-InnoDB tables require a separately reviewed physical/locked backup.')
    directory = Path(args.backup).resolve()
    directory.mkdir(mode=0o700)  # Refuse to overwrite any existing backup.
    db.dump(directory / 'database.sql')
    manifest = {'source': db.identity(), 'sha256': digest(directory / 'database.sql'),
                'schema_sha256': digest(SCHEMA), 'format': 1}
    (directory / 'manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    print('PASS: full database backup and SHA-256 manifest created.')


def restore(db, args):
    directory, manifest = read_backup(args.backup)
    require(db.host == '127.0.0.1' and re.fullmatch(r'gk_party_restore_[a-z0-9_]+', db.name),
            'Restore requires loopback and a gk_party_restore_* database.')
    require(db.name != manifest['source']['database'], 'Restore target must differ from source.')
    exists = db.sql("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='" + db.name + "'", False)
    require(not exists, 'Restore target already exists; no data will be overwritten.')
    # Restore is intentionally restricted to a disposable, isolated MariaDB server.
    require(args.isolated_server_confirmed, 'Confirm an isolated temporary server explicitly.')
    db.sql('CREATE DATABASE `' + db.name + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_polish_ci', False)
    result = db.run('mysql', ['--binary-mode', '--database=' + db.name],
                    (directory / 'database.sql').read_bytes())
    require(not result, 'Unexpected restore output; manual review required.')
    verify(db, args)


def verify(db, args):
    directory, manifest = read_backup(args.backup)
    require(db.host == '127.0.0.1' and db.name.startswith('gk_party_restore_')
            and db.name != manifest['source']['database'], 'Verify a separate local restore database.')
    with tempfile.TemporaryDirectory(prefix='gk-party-verify-') as temp:
        restored = Path(temp) / 'restored.sql'
        db.dump(restored)
        require(digest(restored) == manifest['sha256'],
                'Restored schema/data/routines/events/triggers differ from backup; do not migrate.')
    (directory / 'restore-verified.json').write_text(json.dumps({
        'sha256': manifest['sha256'], 'target': db.identity(), 'verified': True,
    }, indent=2), encoding='utf-8')
    print('PASS: restored full logical dump equals backup (SHA-256).')


def migrate(db, args):
    require(args.maintenance_confirmed, 'Stop all writers and DDL; pass --maintenance-confirmed.')
    directory, manifest = read_backup(args.backup)
    require(db.identity() == manifest['source'], 'Backup belongs to a different source.')
    require(digest(SCHEMA) == manifest['schema_sha256'], 'Schema changed since backup.')
    receipt = json.loads((directory / 'restore-verified.json').read_text(encoding='utf-8'))
    require(receipt.get('verified') is True and receipt['sha256'] == manifest['sha256'],
            'A successful restore verification is required before migration.')
    with tempfile.TemporaryDirectory(prefix='gk-party-before-') as temp:
        current = Path(temp) / 'current.sql'
        db.dump(current)
        require(digest(current) == manifest['sha256'], 'Source changed since backup; repeat backup/restore.')
    existing = db.sql("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() "
                      "AND LEFT(TABLE_NAME,9)='gk_party_'")
    require(not existing, 'Party tables already exist; stop for schema review, never overwrite or drop.')
    db.sql(SCHEMA.read_text(encoding='utf-8'))
    print('PASS: explicit Party setup.sql applied. Keep backup and leave all existing data in place.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['backup', 'restore', 'verify', 'migrate'])
    parser.add_argument('--defaults-file', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--client-bin', required=True)
    parser.add_argument('--backup', required=True)
    parser.add_argument('--confirm-database')
    parser.add_argument('--maintenance-confirmed', action='store_true')
    parser.add_argument('--isolated-server-confirmed', action='store_true')
    args = parser.parse_args(argv)
    if args.action in ('restore', 'migrate'):
        require(args.confirm_database == args.database, 'Repeat the exact target via --confirm-database.')
    db = Database(args.defaults_file, args.database, args.client_bin)
    globals()[args.action](db, args)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, KeyError, configparser.Error) as error:
        # Do not disclose credentials, file contents or database data on errors.
        print('BLOCKED: ' + (str(error) if isinstance(error, RuntimeError)
                            else 'Invalid/missing input or client executable.'), file=sys.stderr)
        sys.exit(1)
