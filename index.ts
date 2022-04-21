import minimist from 'minimist';
import prompts from 'prompts';
import kleur from 'kleur';
import figlet from 'figlet';
import { nginxInstaller } from './lib/nginx-installer';
import { $ } from './utils/zx';

(async () => {
  // await Promise.allSettled([
  //   $`sleep 1; echo 1`,
  //   $`sleep 2; echo 2`,
  //   $`sleep 3; echo 3`,
  // ]);

  await $`clear`;

  const argv = minimist(process.argv.slice(2));

  if (process.getuid() != 0) {
    console.log(
      'This script has to be ran using root user. Please run the script again, but prefix it with "sudo"'
    );
    process.exit(1);
  }

  // Define args
  // const domain_name = argv['domain'];
  // const port = Number(argv['port']);

  //   Define package versions

  console.log(
    kleur.cyan().bold(
      figlet.textSync('Nginx CLI', {
        horizontalLayout: 'controlled smushing',
        font: 'Doom',
      })
    ),
    '\n'
  );

  console.log('Welcome to the Nginx-CLI');
  console.log('\n');

  const menuPrompt = await prompts({
    type: 'select',
    name: 'option',
    message: 'Please select your options',
    choices: [
      {
        title: '1) Install or update Nginx',
        value: 1,
        description: 'This will compile nginx from source, and install it.',
      },
      {
        title: '2) Uninstall Nginx',
        value: 2,
        description:
          'This will remove nginx from system, and you will have option to keep or remove configs.',
      },
      {
        title: '3) Update the script',
        value: 3,
        description: 'It will download latest Nginx-CLI',
      },
      { title: '4) Install Bad Bot Blocker', value: 4 },
      { title: '5) Exit', value: 5 },
    ],
  });

  console.log(menuPrompt.option);

  // 1) Install or update Nginx

  if (menuPrompt.option === 1) {
    await nginxInstaller().catch((err) => console.error(err.message));
  }

  // 2) Uninstall Nginx
  if (menuPrompt.option === 2) {
    await $`clear`;

    console.log('Uninstalling Nginx :)');
  }

  // 3) Update the script
  if (menuPrompt.option === 3) {
    await $`clear`;

    console.log('Updating the script');
  }
})();
