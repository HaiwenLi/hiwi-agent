/**
 * test/verify.ts — 统一验证脚本
 *
 * hiwi-agent 完成所有测试任务后，运行此脚本一键验证。
 * 输出清晰的 PASS/FAIL 表格。
 *
 * 运行方式: npx tsx test/verify.ts
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const TEST_DIR = path.dirname(__filename);

interface TestModule {
  id: string;
  name: string;
  type: 'vitest' | 'compilation' | 'file-exists' | 'custom';
  target?: string;
  files?: string[];
  check?: () => { pass: boolean; detail: string };
}

const modules: TestModule[] = [
  { id: '01', name: 'quicksort', type: 'vitest', target: 'test/01-quicksort' },
  { id: '02', name: 'fibonacci', type: 'vitest', target: 'test/02-fibonacci' },
  { id: '05', name: 'debugging', type: 'vitest', target: 'test/05-debugging' },
  { id: '06', name: 'refactoring', type: 'vitest', target: 'test/06-refactoring' },
  { id: '09', name: 'test-writing', type: 'vitest', target: 'test/09-test-writing' },
  { id: '10', name: 'multi-file', type: 'vitest', target: 'test/10-multi-file' },
  { id: '12', name: 'stress-compile', type: 'compilation', target: 'test/12-stress/large-module.ts' },
  {
    id: '04', name: 'tool-tests', type: 'file-exists',
    files: ['test/04-tool-tests/greeting.txt', 'test/04-tool-tests/hello.txt'],
  },
  {
    id: '08', name: 'data-processing-output', type: 'file-exists',
    files: ['test/08-data-processing/cleaned-data.json', 'test/08-data-processing/summary.json'],
  },
  {
    id: '08b', name: 'data-processing-validity', type: 'custom',
    check: () => {
      const summaryPath = path.join(TEST_DIR, '08-data-processing', 'summary.json');
      if (!existsSync(summaryPath)) {
        return { pass: false, detail: 'summary.json not found' };
      }
      try {
        const data = JSON.parse(readFileSync(summaryPath, 'utf-8'));
        const cats = ['Electronics', 'Clothing', 'Food', 'Books'];
        const hasAll = cats.every(c => data.summary?.[c]);
        return {
          pass: hasAll && typeof data.totalProcessedRows === 'number',
          detail: hasAll ? `Valid: ${data.totalProcessedRows} rows, ${cats.length} categories` : 'Missing categories in summary',
        };
      } catch {
        return { pass: false, detail: 'Invalid JSON in summary.json' };
      }
    },
  },
  {
    id: '11', name: 'bash-advanced', type: 'file-exists',
    files: ['test/11-bash-advanced/repo-analysis.md'],
  },
];

const results: { id: string; name: string; pass: boolean; detail: string }[] = [];

function runVitest(target: string): { pass: boolean; detail: string } {
  try {
    const out = execSync('npx vitest run ' + target + ' --reporter=verbose 2>&1', {
      encoding: 'utf-8',
      timeout: 60000,
    });
    const passCount = (out.match(/✓/g) || []).length;
    const failCount = (out.match(/×/g) || []).length;
    return {
      pass: failCount === 0,
      detail: failCount === 0 ? passCount + ' tests passed' : failCount + ' tests failed (' + passCount + ' passed)',
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const failCount = (msg.match(/×/g) || []).length;
    const passCount = (msg.match(/✓/g) || []).length;
    if (failCount > 0 || passCount > 0) {
      return { pass: false, detail: failCount + ' tests failed (' + passCount + ' passed)' };
    }
    return { pass: false, detail: msg.slice(0, 200) };
  }
}

function runCompilation(target: string): { pass: boolean; detail: string } {
  try {
    execSync('npx tsc --noEmit "' + target + '" 2>&1', { encoding: 'utf-8', timeout: 30000 });
    return { pass: true, detail: 'Compiles without errors' };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const errCount = (msg.match(/error TS\d+/g) || []).length;
    return { pass: false, detail: errCount + ' compilation error(s): ' + msg.slice(0, 200) };
  }
}

function checkFiles(files: string[]): { pass: boolean; detail: string } {
  const missing = files.filter(f => !existsSync(path.join(TEST_DIR, '..', f)));
  if (missing.length === 0) {
    return { pass: true, detail: 'All files exist: ' + files.join(', ') };
  }
  return { pass: false, detail: 'Missing: ' + missing.join(', ') };
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  hiwi-agent Unified Verification Report');
  console.log('========================================');
  console.log('');

  for (const mod of modules) {
    process.stdout.write('  ' + mod.id + ' ' + mod.name.padEnd(25) + ' ');

    let result: { pass: boolean; detail: string };

    switch (mod.type) {
      case 'vitest':
        result = runVitest(mod.target!);
        break;
      case 'compilation':
        result = runCompilation(mod.target!);
        break;
      case 'file-exists':
        result = checkFiles(mod.files!);
        break;
      case 'custom':
        result = mod.check!();
        break;
    }

    results.push({ id: mod.id, name: mod.name, ...result });
    console.log(result.pass ? ' PASS' : ' FAIL');
    console.log('         ' + result.detail);
  }

  console.log('');
  console.log('----------------------------------------');
  console.log('  Manual Checks Required');
  console.log('----------------------------------------');
  console.log('');
  console.log('  03 responsive-page:');
  console.log('    Open test/03-responsive-page/src/index.html in browser');
  console.log('   [ ] Responsive: 375px=1col, 768px=2col, 1200px=4col');
  console.log('   [ ] Dark mode toggle works');
  console.log('   [ ] Card entry animations visible');
  console.log('   [ ] Keyboard Tab focus visible');
  console.log('');
  console.log('  07 web-research:');
  console.log('    Open test/03-responsive-page/src/index.html in browser');
  console.log('   [ ] CSS Container Queries active');
  console.log('   [ ] Card layout changes with container width');
  console.log('   [ ] cqi/cqw units in effect');
  console.log('');

  const passed = results.filter(r => r.pass).length;
  const total = results.length;

  console.log('========================================');
  console.log('  Result: ' + passed + '/' + total + ' passed');
  console.log('========================================');
  console.log('');

  process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);
