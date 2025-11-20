import { OpenAPIAdapter } from '@api-codegen-universal/openapi';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  const adapter = new OpenAPIAdapter();
  // const inputPath = path.join(__dirname, 'example-input-sources', 'openapi.json');
  const inputPath = path.join(
    __dirname,
    'example-input-sources',
    'openapi',
    'my-openapi.json',
  );
  const inputUrl = new URL(`file:///${inputPath.replace(/\\/g, '/')}`);
  const outputPath = path.join(
    __dirname,
    'example-input-sources',
    'openapi',
    'codegen-output.json',
  );

  console.log('Reading from:', inputUrl.href);

  try {
    const result = await adapter.parse(inputUrl, {
      pathClassification: {},
      codeGeneration: {
        output: {
          schemas: true,
          interfaces: true,
          apis: true,
        },
      },
    });

    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log('Successfully wrote to:', outputPath);
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
