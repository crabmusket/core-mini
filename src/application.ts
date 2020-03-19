import { isHttpError } from 'https://raw.githubusercontent.com/curveball/http-errors/master/src/index.ts';
import { EventEmitter } from 'events';
import BaseContext from './base-context';
import Context from './context';
import { HeadersInterface, HeadersObject } from './headers';
import MemoryRequest from './memory-request';
import MemoryResponse from './memory-response';
import NotFoundMw from './middleware/not-found';
import Request from './request';
import Response from './response';

/**
 * The middleware-call Symbol is a special symbol that might exist as a
 * property on an object.
 *
 * If it exists, the object can be used as a middleware.
 */
const middlewareCall = Symbol('middleware-call');
export { middlewareCall };

/**
 * A function that can act as a middleware.
 */
type MiddlewareFunction = (
  ctx: Context,
  next: () => Promise<void>
) => Promise<void> | void;

type MiddlewareObject = {
  [middlewareCall]: MiddlewareFunction
};

export type Middleware = MiddlewareFunction | MiddlewareObject;

// Calls a series of middlewares, in order.
export async function invokeMiddlewares(
  ctx: Context,
  fns: Middleware[]
): Promise<void> {
  if (fns.length === 0) {
    return;
  }

  let mw;
  if ((<MiddlewareObject> fns[0])[middlewareCall] !== undefined) {
    mw = (<MiddlewareObject> fns[0])[middlewareCall].bind(fns[0]);
  } else {
    mw = fns[0];
  }

  return mw(ctx, async () => {
    await invokeMiddlewares(ctx, fns.slice(1));
  });
}

export default class Application extends EventEmitter {
  middlewares: Middleware[] = [];

  /**
   * Add a middleware to the application.
   *
   * Middlewares are called in the order they are added.
   */
  use(...middleware: Middleware[]) {
    this.middlewares.push(...middleware);
  }

  /**
   * Handles a single request and calls all middleware.
   */
  async handle(ctx: Context): Promise<void> {
    //TODO: find the version some other way, or disable it entirely?
    //ctx.response.headers.set('Server', 'curveball/' + pkg.version);
    ctx.response.type = 'application/hal+json';
    await invokeMiddlewares(ctx, [...this.middlewares, NotFoundMw]);
  }

  /**
   * Does a sub-request based on a Request object, and returns a Response
   * object.
   */
  async subRequest(
    method: string,
    path: string,
    headers?: HeadersInterface | HeadersObject,
    body?: any
  ): Promise<Response>;
  async subRequest(request: Request): Promise<Response>;
  async subRequest(
    arg1: string | Request,
    path?: string,
    headers?: HeadersInterface | HeadersObject,
    body: any = ''
  ): Promise<Response> {
    let request: Request;

    if (typeof arg1 === 'string') {
      request = new MemoryRequest(<string> arg1, path!, headers, body);
    } else {
      request = <Request> arg1;
    }

    const context = new BaseContext(request, new MemoryResponse());

    try {
      await this.handle(context);
    } catch (err) {
      // tslint:disable:no-console
      console.error(err);
      if (this.listenerCount('error')) {
        this.emit('error', err);
      }
      if (isHttpError(err)) {
        context.response.status = err.httpStatus;
      } else {
        context.response.status = 500;
      }
      context.response.body =
        'Uncaught exception. No middleware was defined to handle it. We got the following HTTP status: ' +
        context.response.status;
    }
    return context.response;
  }

}
