import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CommissionsService } from './commissions.service';
import { CommissionPreviewDto } from './dto/commission-preview.dto';
import { CommissionRuleQueryDto } from './dto/commission-rule-query.dto';
import { CreateCommissionRuleDto } from './dto/create-commission-rule.dto';
import { UpdateCommissionRuleDto } from './dto/update-commission-rule.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiTags('Admin Commission Rules')
@Controller()
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @Post('admin/commission-rules')
  create(@Body() dto: CreateCommissionRuleDto) {
    return this.commissionsService.create(dto);
  }

  @Get('admin/commission-rules')
  findAll(@Query() query: CommissionRuleQueryDto) {
    return this.commissionsService.findAll(query);
  }

  @Post('admin/commission-rules/preview')
  preview(@Body() dto: CommissionPreviewDto) {
    return this.commissionsService.calculatePreview(dto);
  }

  @Get('admin/vendors/:vendorId/commission-rules')
  findForVendor(@Param('vendorId') vendorId: string) {
    return this.commissionsService.findForVendor(vendorId);
  }

  @Get('admin/commission-rules/:id')
  findOne(@Param('id') id: string) {
    return this.commissionsService.findOne(id);
  }

  @Patch('admin/commission-rules/:id')
  update(@Param('id') id: string, @Body() dto: UpdateCommissionRuleDto) {
    return this.commissionsService.update(id, dto);
  }

  @Patch('admin/commission-rules/:id/activate')
  activate(@Param('id') id: string) {
    return this.commissionsService.activate(id);
  }

  @Patch('admin/commission-rules/:id/deactivate')
  deactivate(@Param('id') id: string) {
    return this.commissionsService.deactivate(id);
  }

  @Delete('admin/commission-rules/:id')
  remove(@Param('id') id: string) {
    return this.commissionsService.remove(id);
  }
}
