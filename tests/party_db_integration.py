"""Real backup/restore tests on a fresh, isolated Windows MariaDB instance."""
import argparse
from contextlib import contextmanager
import importlib.util
import json
import os
from pathlib import Path
import socket
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
import uuid
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('party_db', ROOT / 'scripts/party_db.py')
ops = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ops)


@contextmanager
def isolated_server(binary_dir):
    with tempfile.TemporaryDirectory(prefix='gk-party-backup-') as temp:
        root = Path(temp)
        data = root / 'data'
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        password = uuid.uuid4().hex
        installed = subprocess.run([str(binary_dir / 'mysql_install_db.exe'),
                                    '--datadir=' + str(data), '--port=' + str(port),
                                    '--password=' + password, '--silent'], capture_output=True)
        ops.require(installed.returncode == 0, 'Temporary MariaDB initialization failed.')
        config = root / 'client.cnf'
        config.write_text('[client]\nhost=127.0.0.1\nport=' + str(port)
                          + '\nuser=root\npassword=' + password + '\n', encoding='utf-8')
        with (root / 'server.log').open('wb') as log:
            process = subprocess.Popen([str(binary_dir / 'mysqld.exe'), '--no-defaults',
                                        '--datadir=' + str(data), '--port=' + str(port),
                                        '--bind-address=127.0.0.1', '--skip-name-resolve',
                                        '--event-scheduler=OFF', '--console'], stdout=log, stderr=log,
                                       creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                probe = ops.Database(config, 'mysql', binary_dir)
                for _ in range(100):
                    try:
                        probe.sql('SELECT 1')
                        break
                    except RuntimeError:
                        ops.require(process.poll() is None, 'Temporary MariaDB exited.')
                        time.sleep(0.2)
                else:
                    raise RuntimeError('Temporary MariaDB readiness timeout.')
                yield root, config, binary_dir, port
            finally:
                if process.poll() is None:
                    subprocess.run([str(binary_dir / 'mysqladmin.exe'),
                                    '--defaults-file=' + str(config), '--protocol=tcp',
                                    'shutdown'], capture_output=True, timeout=15)
                    try:
                        process.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()


class BackupRestoreTest(unittest.TestCase):
    def test_full_preproduction_flow(self):
        root, config, binaries, port = self.server
        source = ops.Database(config, 'gk_party_source_test', binaries)
        source.sql('CREATE DATABASE gk_party_source_test CHARACTER SET utf8mb4 COLLATE utf8mb4_polish_ci', False)
        source.sql('''CREATE TABLE portal_data (id INT PRIMARY KEY, value TEXT, payload BLOB) ENGINE=InnoDB;
CREATE TABLE party_legacy (id INT PRIMARY KEY, value VARCHAR(40)) ENGINE=InnoDB;
INSERT INTO portal_data VALUES (1, 'Zażółć gęślą jaźń', X'00010AFF');
INSERT INTO party_legacy VALUES (1, 'retain legacy');
CREATE TABLE audit_log (id INT PRIMARY KEY) ENGINE=InnoDB;
CREATE TRIGGER portal_insert AFTER INSERT ON portal_data FOR EACH ROW INSERT INTO audit_log VALUES (NEW.id);
CREATE PROCEDURE portal_count() SELECT COUNT(*) FROM portal_data;
CREATE EVENT portal_event ON SCHEDULE EVERY 1 DAY DISABLE DO INSERT INTO audit_log VALUES (999);
CREATE VIEW portal_view AS SELECT id, value FROM portal_data;
''')
        print('MariaDB: ' + source.sql('SELECT VERSION()'))

        def command(action, db, folder, *extra):
            return [action, '--defaults-file', str(config), '--client-bin', str(binaries),
                    '--database', db, '--backup', str(folder), *extra]

        before = root / 'before'
        ops.main(command('backup', source.name, before, '--maintenance-confirmed'))
        with self.assertRaises(FileExistsError):
            ops.main(command('backup', source.name, before, '--maintenance-confirmed'))
        with self.assertRaises(FileNotFoundError):
            ops.main(command('migrate', source.name, before, '--maintenance-confirmed',
                             '--confirm-database', source.name))
        restore_name = 'gk_party_restore_before'
        ops.main(command('restore', restore_name, before, '--confirm-database', restore_name,
                         '--isolated-server-confirmed'))
        with self.assertRaises(RuntimeError):
            ops.main(command('restore', restore_name, before, '--confirm-database', restore_name,
                             '--isolated-server-confirmed'))
        with self.assertRaises(RuntimeError):
            ops.main(command('restore', source.name, before, '--confirm-database', source.name,
                             '--isolated-server-confirmed'))
        # Stale backups cannot authorize a migration, even with a valid restore receipt.
        source.sql("INSERT INTO portal_data VALUES (2, 'new data', NULL)")
        with self.assertRaisesRegex(RuntimeError, 'Source changed'):
            ops.main(command('migrate', source.name, before, '--maintenance-confirmed',
                             '--confirm-database', source.name))
        fresh = root / 'fresh'
        ops.main(command('backup', source.name, fresh, '--maintenance-confirmed'))
        restore_name = 'gk_party_restore_fresh'
        ops.main(command('restore', restore_name, fresh, '--confirm-database', restore_name,
                         '--isolated-server-confirmed'))
        remote = ops.Database(config, 'gk_party_restore_remote', binaries)
        remote.host = 'unreachable.invalid'
        with self.assertRaisesRegex(RuntimeError, 'loopback'):
            ops.restore(remote, argparse.Namespace(backup=fresh, isolated_server_confirmed=True))
        ops.main(command('migrate', source.name, fresh, '--maintenance-confirmed',
                         '--confirm-database', source.name))
        self.assertEqual(source.sql('SELECT COUNT(*) FROM portal_data'), '2')
        self.assertEqual(source.sql('SELECT value FROM party_legacy'), 'retain legacy')
        source.sql('''INSERT INTO gk_party_rooms (id, room_code, expires_at, settings_json)
VALUES (1, 'ABCDEF', '2030-01-01', '{"round_order":["quiz"]}');
INSERT INTO gk_party_players (id,room_id,token_hash,nickname,color,seat,score_total)
VALUES (1,1,REPEAT('a',64),'Żółw','#123456',1,1500);
INSERT INTO gk_party_rounds (id,room_id,round_number,game_key,state_json)
VALUES (1,1,1,'quiz','{"step":1}');
INSERT INTO gk_party_round_scores (round_id,player_id,points) VALUES (1,1,1500);
INSERT INTO gk_party_quiz_answers (round_id,player_id,question_index,answer_index,points)
VALUES (1,1,0,1,1500);
INSERT INTO gk_party_higher_lower_answers (round_id,player_id,card_index,choice_value,points)
VALUES (1,1,0,'more',1000);
''')
        # Explicit SQL is repeatable and preserves all rows; automatic migration refuses existing Party tables.
        source.sql(ops.SCHEMA.read_text(encoding='utf-8'))
        after = root / 'after'
        ops.main(command('backup', source.name, after, '--maintenance-confirmed'))
        restore_name = 'gk_party_restore_after'
        ops.main(command('restore', restore_name, after, '--confirm-database', restore_name,
                         '--isolated-server-confirmed'))
        with self.assertRaisesRegex(RuntimeError, 'already exist'):
            ops.main(command('migrate', source.name, after, '--maintenance-confirmed',
                             '--confirm-database', source.name))
        restored = ops.Database(config, restore_name, binaries)
        self.assertEqual(restored.sql('SELECT nickname,score_total FROM gk_party_players'), 'Żółw\t1500')
        self.assertEqual(restored.sql('SELECT HEX(payload) FROM portal_data WHERE id=1'), '00010AFF')
        self.assertEqual(restored.sql('CALL portal_count()'), '2')
        self.assertEqual(restored.sql("SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()"), '1')
        # Verify foreign keys and unique constraints survived the restore.
        with self.assertRaises(RuntimeError):
            restored.sql('INSERT INTO gk_party_round_scores (round_id,player_id) VALUES (999,1)')
        with self.assertRaises(RuntimeError):
            restored.sql('INSERT INTO gk_party_round_scores (round_id,player_id) VALUES (1,1)')
        restored.sql("INSERT INTO portal_data VALUES (3, 'trigger check', NULL)")
        self.assertEqual(restored.sql('SELECT COUNT(*) FROM audit_log WHERE id=3'), '1')
        with self.assertRaisesRegex(RuntimeError, 'differ'):
            ops.main(command('verify', restore_name, after))
        with (after / 'database.sql').open('ab') as stream:
            stream.write(b'\n-- tampered\n')
        with self.assertRaisesRegex(RuntimeError, 'checksum'):
            ops.main(command('restore', 'gk_party_restore_corrupt', after, '--confirm-database',
                             'gk_party_restore_corrupt', '--isolated-server-confirmed'))
        source.sql('CREATE DATABASE gk_party_empty')
        # Schema checks run with a DML-only account and cannot create tables.
        source.sql("CREATE USER 'party_api_test'@'127.0.0.1' IDENTIFIED BY 'temporary_test_only';"
                   "GRANT SELECT,INSERT,UPDATE,DELETE ON gk_party_source_test.* TO 'party_api_test'@'127.0.0.1';"
                   "GRANT SELECT ON gk_party_empty.* TO 'party_api_test'@'127.0.0.1';")
        code = '''require 'gierkoteka/party/bootstrap.php';
$pdo = party_connect(['db_host'=>'127.0.0.1','db_port'=>(int)getenv('TEST_DB_PORT'),
'db_name'=>getenv('TEST_DB_NAME'),'db_user'=>'party_api_test','db_pass'=>'temporary_test_only']);
party_check_schema($pdo); echo 'PASS: schema check with DML-only user';'''
        env = dict(os.environ, TEST_DB_PORT=str(port), TEST_DB_NAME=source.name)
        check = subprocess.run(['php', '-r', code], cwd=ROOT, env=env, capture_output=True)
        self.assertEqual(check.returncode, 0, 'DML-only schema check failed')
        env['TEST_DB_NAME'] = 'gk_party_empty'
        check = subprocess.run(['php', '-r', code], cwd=ROOT, env=env, capture_output=True)
        self.assertNotEqual(check.returncode, 0, 'Missing schema must fail closed')
        self.assertEqual(source.sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='gk_party_empty'"), '0')
        # Real HTTP check on a copy containing no private config, with only test DB credentials.
        web = root / 'web'
        party = web / 'gierkoteka/party'
        party.mkdir(parents=True)
        for path in (ROOT / 'gierkoteka/party').iterdir():
            if path.suffix in ('.php', '.sql') and not path.name.startswith('config'):
                shutil.copyfile(path, party / path.name)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            http_port = listener.getsockname()[1]
        for database, expected_status, expected_code in [
                ('gk_party_empty', 503, 'schema_unavailable'),
                (source.name, 401, 'session_required')]:
            env = {key: value for key, value in os.environ.items()
                   if not key.startswith(('DB_', 'PARTY_DB_'))}
            env.update(PARTY_DB_HOST='127.0.0.1', PARTY_DB_PORT=str(port), PARTY_DB_NAME=database,
                       PARTY_DB_USER='party_api_test', PARTY_DB_PASS='temporary_test_only')
            http = subprocess.Popen(['php', '-S', '127.0.0.1:' + str(http_port), '-t', str(web)],
                                    env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                    creationflags=subprocess.CREATE_NO_WINDOW)
            try:
                for _ in range(50):
                    try:
                        urllib.request.urlopen('http://127.0.0.1:' + str(http_port)
                                               + '/gierkoteka/party/api.php?action=state', timeout=2)
                        self.fail('Unauthenticated request unexpectedly succeeded')
                    except urllib.error.HTTPError as error:
                        self.assertEqual(error.code, expected_status)
                        payload = json.loads(error.read())
                        self.assertIn(expected_code, json.dumps(payload))
                        break
                    except urllib.error.URLError:
                        time.sleep(0.1)
                else:
                    self.fail('HTTP readiness timeout')
            finally:
                http.terminate()
                http.wait(timeout=10)
        self.assertEqual(source.sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='gk_party_empty'"), '0')
        print('PASS: unrelated/Party data, Unicode, BLOB, routines, triggers, events, view, FK/unique, guards and DML-only checks.')

    def test_input_guards(self):
        root, config, binaries, _ = self.server
        db = ops.Database(config, 'mysql', binaries)
        args = argparse.Namespace(maintenance_confirmed=False)
        with self.assertRaisesRegex(RuntimeError, 'writers'):
            ops.backup(db, args)
        with self.assertRaisesRegex(RuntimeError, 'writers'):
            ops.migrate(db, args)
        with self.assertRaisesRegex(RuntimeError, 'Repeat the exact target'):
            ops.main(['migrate', '--defaults-file', str(config), '--database', 'mysql',
                      '--client-bin', str(binaries), '--backup', str(root / 'unused')])
        with self.assertRaisesRegex(RuntimeError, 'Invalid database name'):
            ops.Database(config, 'db;DROP', binaries)
        bad = root / 'bad.cnf'
        bad.write_text('[client]\nhost=127.0.0.1\nport=3306\nuser=test\ninit-command=SELECT 1\n')
        with self.assertRaisesRegex(RuntimeError, 'Unsupported client option'):
            ops.Database(bad, 'mysql', binaries)
        db.sql('CREATE DATABASE gk_party_nontransactional; '
               'CREATE TABLE gk_party_nontransactional.legacy (id INT) ENGINE=MyISAM', False)
        nontransactional = ops.Database(config, 'gk_party_nontransactional', binaries)
        with self.assertRaisesRegex(RuntimeError, 'Non-InnoDB'):
            ops.backup(nontransactional, argparse.Namespace(maintenance_confirmed=True, backup=root / 'nontransactional'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mariadb-bin', type=Path, default=Path(r'C:\xampp\mysql\bin'))
    args = parser.parse_args()
    with isolated_server(args.mariadb_bin) as server:
        BackupRestoreTest.server = server
        result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(BackupRestoreTest))
    sys.exit(0 if result.wasSuccessful() else 1)
