import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipResponseTransform } from './common/decorators/skip-response-transform.decorator';
import { AppService } from './app.service';

@ApiTags('System')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Header('Content-Type', 'text/html')
  @SkipResponseTransform()
  @ApiExcludeEndpoint()
  getHome() {
    return this.appService.getHomePage();
  }

  @Get('health')
  @ApiOperation({ summary: 'Get backend health and API documentation links' })
  getHealth() {
    return this.appService.getHealth();
  }
}
