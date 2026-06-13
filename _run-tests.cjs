const { startVitest } = require('vitest/node');
const path = require('path');
const fs = require('fs');

async function main() {
  const origWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  let captured = '';
  process.stdout.write = (chunk) => { captured += chunk; return true; };
  process.stderr.write = (chunk) => { captured += chunk; return true; };

  try {
    const outputFile = path.resolve('test-results-clean.json');
    const vitest = await startVitest('test', [], {
      reporters: ['json'],
      outputFile,
    });

    await vitest.close();

    process.stdout.write = origWrite;
    process.stderr.write = origStderrWrite;

    let content = fs.readFileSync(outputFile, 'utf8');
    content = content.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\n]*/g, '');

    const jsonStart = content.indexOf('{');
    if (jsonStart > 0) content = content.substring(jsonStart);

    const data = JSON.parse(content);
    console.log('Total:', data.numTotalTests, '| Passed:', data.numPassedTests, '| Failed:', data.numFailedTests);
    console.log('---');

    if (data.numFailedTests > 0) {
      data.testResults.filter(r => r.status === 'failed').forEach(r => {
        const shortName = r.name.split('agent-design').pop() || r.name;
        console.log('\nFAIL:', shortName);
        r.assertionResults.filter(a => a.status === 'failed').forEach(a => {
          console.log('  TEST:', a.fullName);
          if (a.failureMessages && a.failureMessages.length) {
            a.failureMessages.forEach(m => {
              m.split('\n').slice(0, 10).forEach(l => console.log('   ', l));
            });
          }
        });
      });
    } else {
      console.log('All tests pass!');
    }
  } catch (e) {
    process.stdout.write = origWrite;
    process.stderr.write = origStderrWrite;
    console.error('Error:', e.message);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
