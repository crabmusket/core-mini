import { default as Application, middlewareCall } from '../src/application.ts';

const application = new Application();
application.use((ctx, next) => {
  ctx.response.body = 'hi';
});
const response = await application.subRequest('GET', '/');
const body = await response.body;

console.log(response);
console.log(response.body);

/*
expect(body).to.equal('hi');
expect(response.headers.get('server')).to.equal(
  'curveball/' + require('../package.json').version
);
expect(response.status).to.equal(200);
*/
