import { Controller, Get, Query } from '@nestjs/common';
import { UserRole, WalletOwnerType } from '@prisma/client';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ok } from '../common/http/envelope';
import { WalletService } from '../money/wallet.service';

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  private ownerType(role: UserRole): WalletOwnerType {
    return role === 'WORKER' ? 'WORKER' : 'CUSTOMER';
  }

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    return ok(await this.wallet.summary(user.id, this.ownerType(user.role)));
  }

  @Get('transactions')
  async transactions(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const res = await this.wallet.transactions(
      user.id,
      this.ownerType(user.role),
      limit ? Math.min(Number(limit), 100) : 50,
      cursor,
    );
    return ok(res.items, { nextCursor: res.nextCursor, balance: res.balance });
  }
}
