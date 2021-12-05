import {
  HTTPController,
  HTTPMethod,
  HTTPMethodEnum,
  HTTPParam,
  HTTPBody,
  Context,
  EggContext,
} from '@eggjs/tegg';
import { UnprocessableEntityError, NotFoundError, UnauthorizedError } from 'egg-errors';
import { Static, Type } from '@sinclair/typebox';
import { AbstractController } from './AbstractController';
import { LoginResultCode } from '../../common/enum/User';

// body: {
//   _id: 'org.couchdb.user:dddd',
//   name: 'dddd',
//   password: '123123',
//   type: 'user',
//   roles: [],
//   date: '2021-12-03T13:14:21.712Z'
// }
// create user will contains email
// {
//   _id: 'org.couchdb.user:awldj',
//   name: 'awldj',
//   password: 'awdlawjdawldj',
//   email: 'ddd@dawd.com',
//   type: 'user',
//   roles: [],
//   date: '2021-12-03T13:46:30.644Z'
// }
const UserRule = Type.Object({
  type: Type.Literal('user'),
  // date: Type.String({ format: 'date-time' }),
  name: Type.String({ minLength: 1, maxLength: 100 }),
  // https://docs.npmjs.com/policies/security#password-policies
  // Passwords should contain alpha-numeric characters and symbols.
  // Passwords should be a minimum of 8 characters.
  password: Type.String({ minLength: 8, maxLength: 100 }),
  email: Type.Optional(Type.String({ format: 'email' })),
});
type User = Static<typeof UserRule>;

@HTTPController()
export class UserController extends AbstractController {
  // https://github.com/npm/npm-profile/blob/main/index.js#L126
  @HTTPMethod({
    path: '/-/user/org.couchdb.user::username',
    method: HTTPMethodEnum.PUT,
  })
  async loginOrCreateUser(@Context() ctx: EggContext, @HTTPParam() username: string, @HTTPBody() user: User) {
    // headers: {
    //   'user-agent': 'npm/8.1.2 node/v16.13.1 darwin arm64 workspaces/false',
    //   'npm-command': 'adduser',
    //   'content-type': 'application/json',
    //   accept: '*/*',
    //   'content-length': '124',
    //   'accept-encoding': 'gzip,deflate',
    //   host: 'localhost:7001',
    //   connection: 'keep-alive'
    // }
    // console.log(username, user, ctx.headers, ctx.href);
    ctx.tValidate(UserRule, user);
    if (username !== user.name) {
      throw new UnprocessableEntityError(`username(${username}) not match user.name(${user.name})`);
    }

    const result = await this.userService.login(user.name, user.password);
    // user exists and password not match
    if (result.code === LoginResultCode.Fail) {
      throw new UnauthorizedError('Please check your login name and password');
    }

    if (result.code === LoginResultCode.Success) {
      // login success
      // TODO: 2FA feature
      return {
        ok: true,
        id: `org.couchdb.user:${result.user?.name}`,
        rev: result.user?.userId,
        token: result.token?.token,
      };
    }

    // others: LoginResultCode.UserNotFound
    // 1. login request
    if (!user.email) {
      // user not exists
      throw new NotFoundError(`User ${user.name} not exists`);
    }

    // 2. create user request
    const { user: userEntity, token } = await this.userService.create({
      name: user.name,
      password: user.password,
      email: user.email,
      ip: ctx.ip,
    });
    return {
      ok: true,
      id: `org.couchdb.user:${userEntity.name}`,
      rev: userEntity.userId,
      token: token.token,
    };
  }

  // https://github.com/npm/cli/blob/latest/lib/utils/get-identity.js#L20
  @HTTPMethod({
    path: '/-/whoami',
    method: HTTPMethodEnum.GET,
  })
  async whoami(@Context() ctx: EggContext) {
    const authorizedUser = await this.requiredAuthorizedUser(ctx, 'read');
    return {
      username: authorizedUser.name,
    };
  }
}