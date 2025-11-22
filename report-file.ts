import apifoxCodegenFile from './example-input-sources/apifox/apifox-codegen-output.json';
import openApiCodegenFile from './example-input-sources/openapi/codegen-output.json';

console.log('Apifox 生成数据');
console.log('schemas 数量', Object.keys(apifoxCodegenFile.schemas).length);
console.log(
  'interfaces 数量',
  Object.keys(apifoxCodegenFile.interfaces).length,
);
console.log('api 数量', apifoxCodegenFile.apis.length);

console.log('==============================================');

console.log('OpenAPI 生成数据');
console.log('schemas 数量', Object.keys(openApiCodegenFile.schemas).length);
console.log(
  'interfaces 数量',
  Object.keys(openApiCodegenFile.interfaces).length,
);
console.log('api 数量', openApiCodegenFile.apis.length);

console.log('=============================================');

const apifoxSchemas = Object.keys(apifoxCodegenFile.schemas);
const openapiSchemas = Object.keys(openApiCodegenFile.schemas);
// 比较两边名称，找出差异的
const apifoxOnlySchemas = apifoxSchemas.filter(
  (x) => !openapiSchemas.includes(x),
);
const openapiOnlySchemas = openapiSchemas.filter(
  (x) => !apifoxSchemas.includes(x),
);

console.log('Apifox 独有的 schemas 数量', apifoxOnlySchemas.length);
console.log('OpenAPI 独有的 schemas 数量', openapiOnlySchemas.length);
console.log('Apifox 独有的schemas', apifoxOnlySchemas);
console.log('OpenAPI 独有的schemas', openapiOnlySchemas);
