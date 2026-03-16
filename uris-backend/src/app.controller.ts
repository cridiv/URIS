import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRootHealth() {
    return {
      status: 'ok',
      service: 'uris-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
