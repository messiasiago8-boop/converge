# Converge no Render Free e Neon Free

Defina `DATABASE_URL` com a cadeia de conexão PostgreSQL com SSL fornecida pelo Neon. Guarde o valor nas variáveis de ambiente do Render. Os dois processos iniciados por `npm start` usam o mesmo banco. Quando a variável está vazia, o Converge usa o armazenamento local.

Configure também um `JWT_SECRET` estável para preservar sessões entre reinícios. Mantenha as chaves VAPID atuais nas variáveis do Render se já estiverem configuradas. Caso contrário, o PostgreSQL armazena o par VAPID gerado pelo Converge.

## Migrar antes da troca

Se houver dados na versão publicada, baixe **Exportar meus dados** na conta antes de aplicar qualquer mudança na instância. Verifique se o arquivo inclui os registros que você espera. Mantenha o backup fora do repositório e da pasta pública.

### Cópia completa com contas e senhas existentes

Execute a importação antes de iniciar o aplicativo novo, com destino PostgreSQL vazio. Trabalhe com uma cópia consistente, feita com a origem parada ou usando um backup já validado.

```text
backup/
  finance/
    financas.sqlite ou financas_data.json
  portal/
    database_user_<id>.json
    vapid-keys.json (quando disponível)
```

```shell
node migrar-postgres.js backup ./backup sqlite
node migrar-postgres.js backup ./backup json
```

Escolha apenas o comando que corresponde ao banco ativo no backup. A importação preserva os IDs, os hashes de senha e os vínculos dos dados por conta. Se houver arquivos do portal sem a conta correspondente em Finanças, a transação é cancelada para evitar associar dados ao titular errado.

### Arquivo exportado por uma conta

Use este caminho se a única cópia disponível for o JSON de **Exportar meus dados**. Crie uma conta nova no destino antes de importar. Faça a operação sem usar essa conta em outra sessão.

```shell
node migrar-postgres.js conta ./converge-meus-dados.json pessoa@example.com
```

Use o e-mail confirmado do titular. O arquivo não inclui hashes de senha nem inscrições de alertas. A importação recusa contas que já têm registros para evitar sobrescrita ou duplicação.

## Conferir no ambiente novo

1. Entre e confira se os dados importados aparecem em Finanças, Educação, Rotina, Metas e Revisão Semanal.
2. Adicione registros fictícios com uma conta de teste. Abra uma segunda conta e confira o isolamento.
3. Reinicie o aplicativo de teste e confirme que os registros continuam disponíveis.
4. Teste os alertas no celular. O banco preserva as inscrições, mas o envio agendado depende do processo do Render estar em execução.
