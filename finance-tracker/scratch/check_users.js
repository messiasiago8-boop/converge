import db from '../database.js';

db.all('SELECT id, nome, email FROM usuarios', (err, rows) => {
  console.log('Usuarios:', rows);
});
