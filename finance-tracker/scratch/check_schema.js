import db from '../database.js';

db.all("PRAGMA table_info(limites)", (err, cols) => {
  console.log('Limites cols:', cols);
  db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='limites'", (err2, schema) => {
    console.log('Limites schema:', schema);
  });
});
