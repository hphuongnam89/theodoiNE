import { Controller, Get, Req } from '@nestjs/common';
import type { AuthedRequest } from './auth';

@Controller('me')
export class MeController {
  @Get()
  get(@Req() request: AuthedRequest): unknown {
    return request.currentUser;
  }
}
