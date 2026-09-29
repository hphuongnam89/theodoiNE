import { Controller, Get } from '@nestjs/common';
import { Public } from './auth';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  status(): { status: string } {
    return { status: 'ok' };
  }
}
