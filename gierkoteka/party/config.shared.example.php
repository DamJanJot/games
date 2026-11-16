<?php
declare(strict_types=1);

// Skopiuj jako niewersjonowany config.php dopiero po wykonaniu kopii bazy.
// Wpisz nazwę istniejącej bazy, której kopię zweryfikowano przed aktywacją.
return [
    'use_shared_db' => true,
    'shared_db_name' => 'nazwa_bazy_z_kopii',
];
