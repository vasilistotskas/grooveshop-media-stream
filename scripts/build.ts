import { build, $ } from 'bun';

await $`rm -rf build`;

const optionalRequirePackages = [
  'class-transformer',
  'class-validator',
  '@nestjs/microservices',
  '@nestjs/websockets',
  '@fastify/static',
  '@nestjs/mongoose',
  '@mikro-orm/core',
  '@nestjs/typeorm/dist/common/typeorm.utils',
  '@nestjs/sequelize/dist/common/sequelize.utils',
];

const result = await build({
  entrypoints: ['./src/main.ts'],
  outdir: './build/dist',
  target: 'bun',
  minify: {
    syntax: true,
    whitespace: true,
  },
  external: optionalRequirePackages.filter((pkg) => {
    try {
      require(pkg);
      return false;
    } catch (_) {
      return true;
    }
  }),
  splitting: true,
});

if (!result.success) {
  console.log(result.logs[0]);
  process.exit(1);
}

console.log('Built successfully!');
