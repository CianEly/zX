import { parseCsv, stringifyCsv } from './csv';

const testCsv = `id,name,description
1,Alice,Engineer
2,Bob,"Manager, Sales"
3,Charlie,"Quoted ""Value"""
`;

function test() {
  console.log('--- Testing CSV Utility ---');

  // 1. Test Parsing
  const parsed = parseCsv(testCsv);
  console.log('Parsed Headers:', parsed.headers);
  console.log('Parsed Rows Count:', parsed.rows.length);

  const bobRow = parsed.rows[1];
  if (bobRow.description === 'Manager, Sales') {
    console.log('✅ Correctly handled comma in quotes');
  } else {
    console.error('❌ Failed comma in quotes:', bobRow.description);
  }

  const charlieRow = parsed.rows[2];
  if (charlieRow.description === 'Quoted "Value"') {
    console.log('✅ Correctly handled escaped quotes');
  } else {
    console.error('❌ Failed escaped quotes:', charlieRow.description);
  }

  // 2. Test Stringifying
  const stringified = stringifyCsv(parsed);
  if (stringified.includes('"Manager, Sales"') && stringified.includes('"Quoted ""Value"""')) {
    console.log('✅ Successfully re-stringified with quotes');
  } else {
    console.error('❌ Stringification failed to preserve quotes');
  }

  console.log('--- Test Complete ---');
}

test();
