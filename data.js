// Conteúdo do checklist. Para editar a viagem, mexa só neste arquivo.

export const VIAGEM = {
  destino: "Honeymoon",
  ano: "Bupe 2026",
  rota: "GRU → FCO",
  periodo: "01 OUT — 13 OUT",
  noites: "12 NOITES",
  embarque: "2026-10-01",   // AAAA-MM-DD
  retorno:  "2026-10-13"
};

/* orçamento: pessoas e dias em solo italiano, usados nas médias */
export const ORCAMENTO = {
  pessoas: 2,
  dias: 12,
  cambioPadrao: 6.20,
  categorias: [
    "✈️ Passagens Aéreas",
    "🏨 Hospedagem",
    "🚄 Transporte Interno",
    "🌊 Passeios — Florença e região",
    "🏛️ Passeios — Roma",
    "🍝 Alimentação",
    "🧳 Extras"
  ]
};

export const NUMEROS = [
  ["Passaporte válido até, no mínimo", "13/01/2027"],
  ["Passaporte emitido a partir de", "02/10/2016"],
  ["Cobertura médica do seguro", "€ 30.000"],
  ["Subsistência de referência (13 dias)", "≈ € 780 / pessoa"],
  ["Dinheiro em espécie sem declarar (casal)", "até € 10.000"],
  ["Chegada em Guarulhos", "3 h antes"]
];

export const TAPPE = [
  {
    t: "Tirar da frente o que depende de terceiros",
    w: "Até 21 de agosto",
    items: [
      { id:"pass", p:"Conferir os dois passaportes",
        s:"Validade até 13/01/2027 ou depois, emissão a partir de 02/10/2016, sem páginas soltas ou plastificação. Se algum falhar, agende a PF hoje — o gargalo é a fila de agendamento, não a emissão.",
        tag:"prioridade", cls:"hot" },
      { id:"nome", p:"Definir a questão do sobrenome",
        s:"Se ela for mudar o nome, o passaporte novo precisa sair antes da emissão das passagens. Se a certidão atrasar, viajem com o nome de solteira em absolutamente tudo." },
      { id:"pid", p:"Solicitar a Permissão Internacional para Dirigir",
        s:"Obrigatória na Itália junto da CNH. Emissão pelo Detran-SP.",
        tag:"se forem alugar carro" }
    ]
  },
  {
    t: "Vacinas, reservas e ingressos",
    w: "Até 31 de agosto",
    items: [
      { id:"vac", p:"Checar a carteira de vacinação dos dois",
        s:"Tríplice viral (2 doses, por causa dos surtos de sarampo na Europa) e reforço de dT/dTpa. Tomem até meados de setembro para dar tempo de resposta imunológica." },
      { id:"hosp", p:"Fechar as hospedagens que faltam",
        s:"E baixar todos os vouchers em PDF assim que confirmarem." },
      { id:"ing", p:"Comprar os ingressos com hora marcada",
        s:"Coliseu e Fórum, Museus Vaticanos e Galleria Borghese. A Borghese só entra com reserva e esgota semanas antes — outubro ainda é alta temporada em Roma.",
        tag:"esgota cedo", cls:"hot" },
      { id:"cart", p:"Pedir cartão internacional",
        s:"Wise, Nomad ou equivalente. Carreguem euros aos poucos aproveitando a cotação. Serve também como comprovação de recursos na imigração." }
    ]
  },
  {
    t: "Seguro e infraestrutura da viagem",
    w: "1 a 12 de setembro",
    items: [
      { id:"seg", p:"Contratar o seguro viagem dos dois",
        s:"Mínimo de € 30.000 em despesas médicas, mais bagagem e cancelamento. Cancelamento só vale se contratado bem antes — não deixe para a última semana.",
        tag:"prioridade", cls:"hot" },
      { id:"gripe", p:"Tomar a vacina da gripe",
        s:"Outubro é começo de outono por lá.", tag:"opcional", cls:"opt" },
      { id:"pasta", p:"Montar a pasta digital",
        s:"Passaportes, apólice, passagens, hospedagens e ingressos em PDF no celular, no Drive e uma cópia impressa na mala de mão." },
      { id:"banco", p:"Avisar banco e operadora do cartão",
        s:"Confirmar limite internacional liberado e conferir o IOF de cada cartão." },
      { id:"chip", p:"Comprar eSIM ou chip europeu",
        s:"Bem mais barato antes do que no aeroporto." }
    ]
  },
  {
    t: "Conferências finais",
    w: "13 a 24 de setembro",
    items: [
      { id:"etias", p:"Checar o site oficial do ETIAS",
        s:"travel-europe.europa.eu/etias — pela situação atual não deve estar em vigor, mas essa checagem fecha o assunto. Só o site oficial: qualquer página cobrando por ETIAS hoje é fraude." },
      { id:"econ", p:"Registrar a viagem no e-Consular",
        s:"Site do Itamaraty. Dois minutos, e ajuda em qualquer emergência." },
      { id:"euro", p:"Separar euros em espécie",
        s:"A taxa de turismo do hotel em Roma é cobrada por pessoa/noite, quase sempre em dinheiro e fora da reserva." },
      { id:"adap", p:"Comprar adaptadores de tomada",
        s:"Padrão tipo L/F. Levem dois e confiram a voltagem dos aparelhos." },
      { id:"farm", p:"Montar a farmacinha",
        s:"Remédios de uso contínuo na embalagem original, com receita em mãos." }
    ]
  },
  {
    t: "Última semana",
    w: "25 a 30 de setembro",
    items: [
      { id:"mala", p:"Fazer as malas",
        s:"Roma em outubro fica entre 14 °C e 24 °C, com chuva de passagem. Sapato de caminhada confortável é o item mais importante da mala." },
      { id:"checkin", p:"Fazer o check-in do voo",
        s:"Abre 24 a 48 h antes, conforme a companhia. Dia 30/09." },
      { id:"app", p:"Instalar o app Travel to Europe",
        s:"Permite pré-registrar passaporte e foto nas 72 h antes de chegar à fronteira. Ainda não funciona em todos os aeroportos, mas se estiver disponível em Roma, adianta o EES.",
        tag:"opcional", cls:"opt" },
      { id:"mao", p:"Conferir a bagagem de mão",
        s:"Passaportes, apólice impressa, cartões, remédios, carregador e adaptador." }
    ]
  },
  {
    t: "1 de outubro — dia do voo",
    w: "Quinta-feira",
    items: [
      { id:"gru", p:"Chegar em Guarulhos 3 horas antes" },
      { id:"ees", p:"Encarar a imigração com folga",
        s:"Na primeira entrada no Espaço Schengen há coleta de foto e digitais pelo EES, e as filas estão longas desde abril. Se houver conexão europeia antes de Roma, o ideal são 2h30 entre os voos." },
      { id:"tax", p:"Pagar a taxa de turismo no check-in do hotel",
        s:"Em dinheiro, por pessoa e por noite." },
      { id:"ztl", p:"Não entrar de carro no centro histórico",
        s:"As ZTLs multam por câmera automaticamente. Peguem o carro só na saída da cidade.",
        tag:"se forem alugar carro" }
    ]
  }
];
