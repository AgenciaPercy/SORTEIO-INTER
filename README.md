# INTERCNC — Sorteio da feira (v2, dados centralizados)

Versão pronta para publicar no Railway com **múltiplos aparelhos cadastrando ao
mesmo tempo**. Os dados agora ficam num servidor central (arquivo JSON no
backend), em vez do `localStorage` do navegador — qualquer tablet que abrir a
mesma URL vê os mesmos cadastros.

## Como publicar no Railway

1. Crie um repositório no GitHub e envie todo o conteúdo desta pasta
   (`server.js`, `package.json`, `public/`, `README.md`) para a raiz.
2. No Railway: **New Project → Deploy from GitHub repo** e escolha esse
   repositório.
3. Em **Variables**, defina:
   - `ADMIN_PASSWORD` — senha que a equipe vai usar para abrir a aba
     "Gestão e sorteio" (excluir cadastros, sortear, apagar tudo). **Sem essa
     variável a aba de gestão fica bloqueada.**
   - `DATA_DIR` — opcional, mas **fortemente recomendado**: aponte para o
     caminho de um Volume (veja abaixo), ex. `/data`.
4. Crie um **Volume** em Settings → Volumes e monte em `/data` (ou o caminho
   que você usou em `DATA_DIR`). Sem volume, os cadastros são apagados a cada
   novo deploy ou restart, porque o filesystem do container é efêmero.
5. Em **Settings → Networking**, gere o domínio público do serviço.
6. Compartilhe essa URL com os tablets/notebooks que vão cadastrar. Todos
   verão os mesmos dados em tempo real.

O comando de início é `npm start` (`node server.js`); o Railway fornece a
variável `PORT` automaticamente.

## Segurança

A tela de **cadastro** (`/`) é pública, como antes — qualquer visitante pode
se inscrever. A aba **Gestão e sorteio** agora exige a senha definida em
`ADMIN_PASSWORD`, porque a página passou a ficar acessível pela internet (não
é mais um único tablet controlado pela equipe). Compartilhe essa senha só com
quem for operar o sorteio.

## Operação na feira

- Abra a mesma URL em quantos aparelhos quiser para cadastro — os dados são
  gravados no servidor, então todos ficam sincronizados.
- Na aba "Gestão e sorteio", informe a senha uma vez por aparelho/navegador
  (fica salva na sessão do navegador até fechar a aba).
- "Baixar planilha CSV" e "Baixar backup JSON" exportam os dados atuais do
  servidor.
- "Importar backup JSON" mescla um backup antigo com os dados do servidor,
  ignorando IDs já existentes — útil para recuperar registros feitos antes da
  migração para este backend.
- Faça backups periódicos durante a feira mesmo assim, por segurança.

## Rodando localmente para testar

```bash
npm install
ADMIN_PASSWORD=minha-senha PORT=3000 npm start
```

Depois acesse `http://localhost:3000`.
