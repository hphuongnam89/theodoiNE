import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Pool } from 'pg';
import { OidcGuard } from './auth';
import { ApplicationsController } from './applications.controller';
import { DashboardController } from './dashboard.controller';
import { HealthController } from './health.controller';
import { MeController } from './me.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminAuditController } from './admin-audit.controller';
import { PaymentsController } from './payments.controller';
import { NeEventsController } from './ne-events.controller';
import { CtvController } from './ctv.controller';
import { RolesGuard } from './roles';

@Module({
  controllers: [
    HealthController, MeController, ApplicationsController, DashboardController,
    AdminUsersController, AdminAuditController,
    PaymentsController, NeEventsController, CtvController,
  ],
  providers: [
    {
      provide: 'PG_POOL',
      useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }),
    },
    { provide: APP_GUARD, useClass: OidcGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
