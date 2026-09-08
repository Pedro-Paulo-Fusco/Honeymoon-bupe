# Roma 2026 — Bupe

App de bolso da lua de mel, para os dois celulares. Seis abas: **Checklist**, **Roteiro**,
**Estadias**, **Documentos**, **Orçamento** e **Lugares**. Tudo sincroniza pelo mesmo código e
tudo abre offline.

---

## Como atualizar o que já está no ar

### 1. Subir os arquivos

Suba todos os arquivos desta pasta, sobrescrevendo os antigos. Os arquivos de view ficam
**na raiz**, com o prefixo `view-` (`view-checklist.js`, `view-roteiro.js`, …). Não existe
pasta `views/`.

> O `firebase-config.js` já está com as suas chaves. Se você corrigiu a `apiKey` depois,
> **não sobrescreva esse arquivo** — mantenha o que já está no repositório.

A pasta `.impeccable/` é saída de ferramenta de design e não faz parte do app. O `.gitignore`
já a exclui.

### 2. Republicar as regras do Firebase — obrigatório

Console → Realtime Database → aba **Regras** → apagar tudo, colar o conteúdo de
`database.rules.json` → **Publicar**.

As regras recusam qualquer campo que não esteja declarado nelas, e qualquer ramo novo é
recusado inteiro. A versão atual inclui `pagamentos` dentro de cada item do orçamento e o
ramo `lugares`. **Sem republicar, os pagamentos e a aba Lugares são recusados com
"permission denied".**

### 3. Forçar a atualização nos celulares

O `sw.js` está em `bupe2026-v10`, então o service worker troca sozinho. Se algum celular
insistir na versão antiga, feche o app completamente e reabra, ou recarregue com Ctrl+Shift+R
no navegador.

---

## O que cada aba faz

### Checklist
Os 25 itens originais, em fases com prazo, mais uma etapa extra ("Outras coisas nossas").
Cada fase tem **"+ adicionar item nesta etapa"**. Itens criados por vocês aparecem com a marca
"nosso" e podem ser editados ou excluídos; os originais só podem ser marcados.

Fases recolhidas continuam recolhidas: o estado fica salvo neste aparelho e **não é mais
desfeito ao marcar uma caixa**. Uma fase que você acabou de completar continua aberta — ela só
volta recolhida na próxima vez que o app abrir.

### Roteiro
Organizado por dia: data, cidade, título e observações; dentro, paradas com horário, nome e
detalhe. As paradas se reordenam pelo horário e os dias se agrupam por cidade, em ordem
cronológica. Importador de CSV, TSV ou texto colado, com pré-visualização e escolha entre
somar ou substituir.

### Estadias
Nome, cidade, endereço, check-in e check-out (com contagem de noites), código da reserva,
telefone clicável e observações. **Abrir no mapa** monta a busca no Google Maps. Fotos entram
em lote e são comprimidas no próprio celular antes de subir.

### Documentos
Título, tipo, dono, número, validade, observação e um arquivo (foto ou PDF).

**A escolha importante está em cada documento:**

- **Só neste aparelho** (padrão) — fica no armazenamento interno, nunca sobe para a nuvem, e o
  outro celular não vê. É a opção certa para passaporte e RG.
- **Sincronizar** — sobe para o Firebase e aparece no outro celular. Prático para passagens,
  vouchers e apólice do seguro.

Quem tiver o código do casal lê tudo que está sincronizado. Por isso a opção local é o padrão,
e por isso o app sorteia o código com `crypto.getRandomValues` em vez de deixar você escolher
algo adivinhável.

### Orçamento
Itens por categoria, com quantidade, valor em euro ou em real, e câmbio ajustável.

**Cada pagamento é um lançamento próprio**, com valor, data e autor. Os dois celulares podem
registrar pagamentos no mesmo item sem que um apague o do outro, e o histórico mostra quem
pagou o quê. O campo antigo de total pago continua valendo como saldo inicial, então nada do
que já estava preenchido se perde.

### Lugares
As indicações que vocês foram juntando — restaurantes, gelaterias, cafés, lojas — com tipo,
cidade, horário, faixa de preço e o motivo pelo qual valem a pena.

**Ela não abre numa lista alfabética.** Abre no que serve agora: o app lê a data de hoje, acha
o dia correspondente no Roteiro e mostra primeiro os lugares da cidade onde vocês estão, sob o
título "Hoje · Roma". O resto vem abaixo, na ordem em que a viagem passa por cada cidade. A
pergunta que ela responde é a que se faz em pé na rua: sobrou uma hora aqui, o que presta perto?

Cada lugar pode ser marcado como **já fomos**. O visitado não some: perde peso, desce para o
fim do grupo, e guarda a data. No fim da viagem essa é a lista do que vocês realmente
aproveitaram. O contador na aba mostra quantos ainda **faltam**.

Dá para cadastrar um a um ou colar uma lista inteira. O importador aceita CSV com cabeçalho e
também texto solto, do jeito que a indicação costuma chegar:

```
Pizzarium — pizzaria — al taglio, do Bonci, perto do Vaticano
Fatamorgana — sorveteria — sabores estranhos que funcionam
```

Ele reconhece "pizzaria", "trattoria", "sorveteria", "caffè", "enoteca" e afins, e encaixa no
tipo certo sozinho.

---

## Trabalhar a dois

- Quem gravou cada dia, estadia, documento ou item do orçamento aparece no cartão — **só quando
  não foi você**, para não virar ruído.
- A pastilha no topo mostra o estado da sincronia. O cartão completo só aparece quando há algo a
  explicar: falha de conexão, falta de permissão, ou quando você toca na pastilha.
- Quando o outro celular está com o app aberto, isso aparece no painel de sincronia.

## Se algo der errado

**Nada é excluído sem volta.** Toda exclusão — dia do roteiro com as paradas, estadia com as
fotos, documento, item do orçamento, item do checklist — mostra **Desfazer** por alguns
segundos, e o registro volta inteiro. "Zerar checklist" também.

**Alterações feitas sem rede não somem em silêncio.** Elas entram numa fila que sobrevive ao
fechamento do app; o cartão mostra "não enviado" e a pastilha conta quantas faltam. Quando a
rede volta, a fila sobe antes de o app voltar a escutar o servidor, para que o que veio do outro
celular não passe por cima do que ainda não subiu.

---

## Limites técnicos

| | Limite | Por quê |
|---|---|---|
| Foto de hospedagem | ~900 KB depois de comprimir | Cabe folgado no 1 GB gratuito do plano Spark |
| Arquivo de documento | ~1,2 MB | Idem |
| PDF | não é comprimido | Se passar do limite, tire um print da página que interessa |
| Total do banco | 1 GB | Dá para centenas de fotos comprimidas |

O Firebase Storage exigiria o plano Blaze, com cartão cadastrado. Por isso as imagens vão dentro
do próprio Realtime Database, comprimidas antes de subir. Para álbum de viagem, Google Fotos
continua sendo o lugar certo — aqui é para documento e referência.

## Offline

O app inteiro, incluindo fotos e documentos, fica espelhado no **IndexedDB** do celular. Abre e
funciona sem internet, mostrando o último estado sincronizado.

Na prática: dá para abrir o voucher da hospedagem no aeroporto de Fiumicino sem roaming.

## Backup

O botão **Baixar backup** no rodapé gera um `.json` com absolutamente tudo — o que está
sincronizado e o que está só no aparelho. Vale rodar uma vez antes de viajar e guardar no Drive.

---

## Editar depois

| Quero mudar | Arquivo |
|---|---|
| Itens fixos do checklist, números-chave, datas da viagem | `data.js` |
| Cores, tipografia, espaçamentos | `styles.css` |
| Comportamento de uma aba | `view-<aba>.js`, na raiz |
| Tipos de lugar (restaurante, gelateria…) | `data.js`, em `LUGARES.tipos` |
| Sincronização, fila de pendências, armazenamento | `store.js` |
| Regras de validação do banco | `database.rules.json` (republicar no console depois) |

As datas mandam em `data.js`: noites, dias em solo e dias corridos são **contados a partir de
`EMBARQUE` e `RETORNO`**, e não devem ser escritos à mão. São três medidas distintas da mesma
viagem — 12 noites, 12 dias em solo, 13 dias corridos — e cada uma tem seu uso.

**Sempre que editar qualquer arquivo, suba a versão em `sw.js`** (`bupe2026-v10` → `v11`).
Sem isso, os celulares que já abriram o app continuam servindo a versão antiga do cache.
