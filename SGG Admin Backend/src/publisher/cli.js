/** Publish from the command line:  npm run publish [-- --dry] */
import { pathToFileURL } from 'node:url';
import { publishSite } from './publish.js';

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dryRun = process.argv.includes('--dry');
  publishSite({ dryRun })
    .then((r) => {
      r.log?.forEach((l) => console.log('  ' + l));
      if (r.dryRun) console.log(`  Dry run: ${r.count} files would be written.`);
      else console.log(`  Published ${r.count} files in ${r.ms}ms.\n  Backup: ${r.backupPath}`);
    })
    .catch((err) => {
      console.error('Publish failed:', err.message);
      process.exitCode = 1;
    });
}
