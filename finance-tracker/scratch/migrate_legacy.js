import db from '../database.js';

// Atribui todos os registros legados com usuario_id NULL para o usuário principal (ID 2: Iago)
db.run("UPDATE despesas SET usuario_id = 2 WHERE usuario_id IS NULL", function(err) {
  console.log('Despesas migradas para usuario_id 2:', this.changes);
  db.run("UPDATE entradas SET usuario_id = 2 WHERE usuario_id IS NULL", function(err2) {
    console.log('Entradas migradas para usuario_id 2:', this.changes);
    db.run("UPDATE potes SET usuario_id = 2 WHERE usuario_id IS NULL", function(err3) {
      console.log('Potes migrados:', this.changes);
      db.run("UPDATE projetos_compras SET usuario_id = 2 WHERE usuario_id IS NULL", function(err4) {
        console.log('Projetos migrados:', this.changes);
      });
    });
  });
});
