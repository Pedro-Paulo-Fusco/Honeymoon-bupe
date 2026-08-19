# Roma 2026 — versão 2

O app agora tem quatro abas: **Checklist**, **Roteiro**, **Estadias** e **Documentos**.
Tudo continua sincronizando entre os dois celulares pelo mesmo código, e tudo abre offline.

---

## Como atualizar o que já está no ar

Você já tem o repositório publicado e o Firebase configurado. Para atualizar:

### 1. Substituir os arquivos no repositório

Suba todos os arquivos desta pasta, sobrescrevendo os antigos. Há uma pasta nova, `views/`,
com quatro arquivos dentro — ela precisa subir com a estrutura preservada.

> O `firebase-config.js` incluído aqui já está com as suas chaves. Se você corrigiu a `apiKey`
> depois, **não sobrescreva esse arquivo** — mantenha o que já está no repositório.

Arquivos que mudaram ou são novos:

```
index.html        (reescrito)
styles.css        (reescrito)
app.js            (reescrito)
store.js          (novo)
util.js           (novo)
views/checklist.js  (novo)
views/roteiro.js    (novo)
views/estadias.js   (novo)
views/docs.js       (novo)
sw.js             (versão do cache subiu para v2)
manifest.json     (nome atualizado)
database.rules.json (novas regras — precisa republicar)
data.js           (igual)
```

### 2. Republicar as regras do Firebase

Console → Realtime Database → aba **Regras** → apagar tudo, colar o conteúdo de
`database.rules.json` → **Publicar**.

Isso é obrigatório: as regras antigas só permitiam o ramo `items`, então roteiro, estadias
e documentos seriam recusados com "permission denied".

### 3. Forçar a atualização nos celulares

O `sw.js` já subiu para `roma2026-v2`, então o service worker troca sozinho. Se algum celular
insistir na versão antiga, feche o app completamente e reabra, ou recarregue com Ctrl+Shift+R
no navegador.

---

## O que cada aba faz

### Checklist
Os 25 itens originais continuam lá. Agora cada etapa tem um **"+ adicionar item nesta etapa"**,
e existe uma etapa extra ("Outras coisas nossas") para o que não se encaixa nas fases com prazo.
Itens criados por vocês aparecem com a marca "nosso" e podem ser editados ou excluídos pelo lápis.
Os itens originais não podem ser excluídos — só marcados.

### Roteiro
Organizado por dia. Cada dia tem data, cidade, título e observações; dentro dele, paradas com
horário, nome e detalhe. As paradas se reordenam sozinhas pelo horário, e os dias se agrupam
automaticamente por cidade, na ordem cronológica.

### Estadias
Nome, cidade, endereço, check-in e check-out (com contagem de noites automática), código da
reserva, telefone clicável e observações. O botão **Abrir no mapa** monta a busca no Google Maps
a partir do nome e endereço. Fotos podem ser adicionadas em lote — o app comprime cada uma no
próprio celular antes de subir, então uma foto de 4 MB vira uns 150 KB.

### Documentos
Cada documento tem título, tipo, dono, número, validade, observação e um arquivo (foto ou PDF).

**A escolha importante está em cada documento:**

- **Só neste aparelho** (padrão) — fica no armazenamento interno do celular, nunca sobe para
  a nuvem, e o outro celular não vê. É a opção certa para passaporte e RG.
- **Sincronizar** — sobe para o Firebase e aparece no outro celular. Prático para passagens,
  vouchers e apólice do seguro.

Quem tiver o código do casal consegue ler tudo que está sincronizado. Por isso a opção local
é o padrão, e por isso o app sugere códigos aleatórios em vez de deixar você escolher algo
adivinhável.

---

## Limites técnicos

| | Limite | Por quê |
|---|---|---|
| Foto de hospedagem | ~900 KB depois de comprimir | Cabe folgado no 1 GB gratuito do plano Spark |
| Arquivo de documento | ~1,2 MB | Idem |
| PDF | não é comprimido | Se passar do limite, tire um print da página que interessa |
| Total do banco | 1 GB | Dá para centenas de fotos comprimidas |

O Firebase Storage (serviço próprio para arquivos) exigiria o plano Blaze, com cartão cadastrado.
Por isso as imagens vão dentro do próprio Realtime Database, comprimidas antes de subir.
Para álbum de viagem mesmo, Google Fotos continua sendo o lugar certo — aqui é para documento
e referência.

---

## Offline

O app inteiro, incluindo as fotos e os documentos, fica espelhado no **IndexedDB** do celular.
Abre e funciona sem internet, mostrando o último estado sincronizado. Alterações feitas offline
ficam guardadas e sobem quando a conexão volta.

Na prática: dá para abrir o voucher da hospedagem no aeroporto de Fiumicino sem roaming.

---

## Backup

O botão **Baixar backup** no rodapé gera um `.json` com absolutamente tudo — o que está
sincronizado e o que está só no aparelho. Vale rodar uma vez antes de viajar e guardar no Drive.

---

## Editar depois

| Quero mudar | Arquivo |
|---|---|
| Itens fixos do checklist, números-chave, datas da viagem | `data.js` |
| Cores, tipografia, espaçamentos | `styles.css` |
| Comportamento de uma aba específica | `views/` |
| Sincronização e armazenamento | `store.js` |

**Sempre que editar qualquer arquivo, suba a versão em `sw.js`** (`roma2026-v2` → `v3`).
Sem isso, os celulares que já abriram o app continuam servindo a versão antiga do cache.
