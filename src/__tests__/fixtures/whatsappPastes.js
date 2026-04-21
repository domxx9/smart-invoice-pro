export const whatsappPastes = {
  basicAnd: {
    raw: '[10:14, John Doe]: blue scissors and 2 brake pads',
    expectedItems: [
      { text: 'blue scissors', qty: 1 },
      { text: '2 brake pads', qty: 2 },
    ],
  },
  basicAlso: {
    raw: '[11:22, Jane Smith]: 1 oil filter also 3 spark plugs',
    expectedItems: [
      { text: '1 oil filter', qty: 1 },
      { text: '3 spark plugs', qty: 3 },
    ],
  },
  withHeaderTimestamp: {
    raw: '[18:45, Service Manager]: blue scissors',
    expectedItems: [{ text: 'blue scissors', qty: 1 }],
  },
  complexMixed: {
    raw: '[12:30, TeamLead]:\n5 blue bolts and 2 scissors also 1 oil filter + 3 spark plugs',
    expectedItems: [
      { text: '5 blue bolts', qty: 5 },
      { text: '2 scissors', qty: 2 },
      { text: '1 oil filter', qty: 1 },
      { text: '3 spark plugs', qty: 3 },
    ],
  },
}

export const testProducts = [
  { id: 'p1', name: 'Bilstein 5100 Front Shock', desc: 'Front shock' },
  { id: 'p2', name: 'Bilstein 5100 Rear Shock', desc: 'Rear shock' },
  { id: 'p3', name: 'Brake Pad Set Front', desc: 'Front brake pads' },
  { id: 'p4', name: 'Brake Pad Set Rear', desc: 'Rear brake pads' },
  { id: 'p5', name: 'Oil Filter Standard', desc: 'Oil filter for engines' },
  { id: 'p6', name: 'Air Filter Premium', desc: 'Air filter' },
  { id: 'p7', name: 'Spark Plug NGK', desc: 'Spark plugs' },
  { id: 'p8', name: 'Wiper Blade 22"', desc: 'Wiper blade' },
  { id: 'p9', name: 'Adson Scissors Straight Blue', desc: 'Surgical scissors', keywords: 'scissors adson' },
]
