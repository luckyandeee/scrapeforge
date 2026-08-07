const readline = require('readline');
const { execSync } = require('child_process');
const fs = require('fs');
require('dotenv').config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function runCommand(command, successMessage) {
  try {
    execSync(command, { stdio: 'inherit' });
    if (successMessage) console.log(`\x1b[32m✔ ${successMessage}\x1b[0m\n`);
  } catch (error) {
    console.error(`\x1b[31m✖ Command failed: ${command}\x1b[0m`);
    process.exit(1);
  }
}

async function main() {
  console.log('\n\x1b[36m======================================\x1b[0m');
  console.log('\x1b[1m🚀 ScrapeForge Git & Release Publisher\x1b[0m');
  console.log('\x1b[36m======================================\x1b[0m\n');

  try {
    const status = execSync('git status --porcelain').toString();
    const hasChanges = status.trim().length > 0;

    let commitMsg = "";
    if (hasChanges) {
      commitMsg = await question('\x1b[33m📝 Enter your commit message:\x1b[0m ');
      while (!commitMsg.trim()) {
        console.log('\x1b[31mCommit message cannot be empty!\x1b[0m');
        commitMsg = await question('\x1b[33m📝 Enter your commit message:\x1b[0m ');
      }
    } else {
      console.log('\x1b[32m✔ Working directory clean. Skipping code commit phase.\x1b[0m\n');
    }

    console.log('\x1b[36m📦 Semantic Versioning Guide:\x1b[0m');
    console.log('  \x1b[32mpatch\x1b[0m : Bug fixes / small tweaks (1.0.0 -> 1.0.1)');
    console.log('  \x1b[33mminor\x1b[0m : New features, backwards compatible (1.0.0 -> 1.1.0)');
    console.log('  \x1b[31mmajor\x1b[0m : Breaking changes / massive rewrites (1.0.0 -> 2.0.0)');
    console.log('  \x1b[90mskip\x1b[0m  : Just save code, no build/version bump\n');

    const bumpChoice = await question('\x1b[33m👉 Choose bump type (patch / minor / major / skip):\x1b[0m ');
    const bumpType = bumpChoice.trim().toLowerCase();
    const shouldBump = ['patch', 'minor', 'major'].includes(bumpType);

    console.log('\n\x1b[36m--- STARTING AUTOMATION ---\x1b[0m\n');

    if (hasChanges) {
      console.log('➕ Staging changes...');
      await runCommand('git add .', 'Files staged');

      console.log('💾 Committing changes...');
      await runCommand(`git commit -m "${commitMsg}"`, 'Changes committed');
    }

    if (shouldBump) {
      console.log(`⬆️ Bumping \x1b[36m${bumpType}\x1b[0m version...`);
      await runCommand(`npm version ${bumpType} --no-git-tag-version`, `Version bumped in package.json`);

      // Read the newly bumped version directly from package.json
      const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
      const newVersion = `v${pkg.version}`;

      await runCommand('git add package.json', 'Version bump staged');
      await runCommand(`git commit -m "chore: bump version to ${newVersion}"`, 'Version bump committed');

      console.log('⚙️ Building local Windows installer & latest.yml...');
      await runCommand('npx electron-builder --win', 'Installer and latest.yml built successfully!');

      console.log(`🏷️ Creating local git tag: ${newVersion}...`);
      await runCommand(`git tag ${newVersion}`, `Tag ${newVersion} created`);
    }

    console.log('🚀 Pushing code to GitHub...');
    await runCommand('git push origin main', 'Code pushed');

    if (shouldBump) {
      console.log('🏷️ Pushing release tags to GitHub...');
      await runCommand('git push origin --tags', 'Tags pushed');
    }

    console.log('\x1b[32m\x1b[1m🎉 All done! Code pushed & installer/latest.yml are ready in the dist-release folder!\x1b[0m\n');

  } catch (error) {
    console.error('\n\x1b[31m✖ An unexpected error occurred:\x1b[0m', error);
  } finally {
    rl.close();
  }
}

main();