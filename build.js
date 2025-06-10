// build.js
const builder   = require('electron-builder');
const nodeFetch = require('node-fetch');
const fs        = require('fs');
const path      = require('path');
const png2icons = require('png2icons');
const Jimp      = require('jimp');

// Puxa o productName e outras infos do package.json
const pkg        = require('./package.json');
const { build }  = pkg;
const productName = build.productName || pkg.name;
const appId       = build.appId;
const publish     = build.publish;

class Builder {
  /**
   * Gera os ícones a partir de uma URL de PNG
   * - icon.png (256×256)
   * - icon.ico (Windows)
   * - icon.icns (macOS)
   */
  async iconSet(url) {
    console.log(`⏬ Baixando ícone de ${url}…`);
    const res = await nodeFetch(url);
    if (res.status !== 200) {
      throw new Error(`Falha ao baixar ícone: HTTP ${res.status}`);
    }
    let buffer = await res.buffer();

    // Corrige possíveis bytes extras após IEND
    const IEND = Buffer.from([0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82]);
    const idx = buffer.indexOf(IEND);
    if (idx !== -1) {
      buffer = buffer.slice(0, idx + IEND.length);
    }

    const image = await Jimp.read(buffer);
    const png256 = await image
      .resize(256, 256)
      .getBufferAsync(Jimp.MIME_PNG);

    const buildDir = path.join(__dirname, 'build');
    fs.mkdirSync(buildDir, { recursive: true });

    // grava PNG
    fs.writeFileSync(path.join(buildDir, 'icon.png'), png256);
    // gera ICO e ICNS
    fs.writeFileSync(
      path.join(buildDir, 'icon.ico'),
      png2icons.createICO(png256, png2icons.BILINEAR, 0, false)
    );
    fs.writeFileSync(
      path.join(buildDir, 'icon.icns'),
      png2icons.createICNS(png256, png2icons.BILINEAR, 0)
    );

    console.log('✅ Ícones gerados em build/');
  }

  /**
   * Executa o electron-builder programaticamente
   */
  async build() {
    console.log('🚧 Iniciando processo de build…');

    try {
      await builder.build({
        config: {
          appId,
          productName,
          directories: {
            output: build.directories.output,
            buildResources: build.directories.buildResources
          },
          files: build.files,
          extraResources: build.extraResources || [],
          publish,
          compression: build.compression || 'maximum',
          asar: build.asar !== false,

          // Windows
          win: {
            icon: path.join('build', 'icon.ico'),
            target: build.win.target
          },
          nsis: build.nsis,

          // macOS
          mac: {
            icon: path.join('build', 'icon.icns'),
            target: build.mac.target,
            category: build.mac.category
          },
          dmg: build.dmg,

          // Linux
          linux: {
            icon: build.linux.icon,
            target: build.linux.target,
            category: build.linux.category
          },
          appImage: build.appImage,

          protocols: build.protocols
        }
      });
      console.log('✅ Build concluída com sucesso!');
    } catch (err) {
      console.error('❌ Erro durante a build:', err);
      process.exit(1);
    }
  }
}

const cli = new Builder();

// Interpreta argumentos
const arg = process.argv[2];
if (arg && arg.startsWith('--icon=')) {
  const url = arg.replace('--icon=', '');
  cli.iconSet(url).catch(err => {
    console.error(err);
    process.exit(1);
  });
} else if (arg === '--build') {
  cli.build();
} else {
  console.log(`
Uso:
  node build.js --icon=<URL-do-PNG>   Gera icon.png, .ico e .icns em build/
  node build.js --build                Executa o electron-builder
`);
}
