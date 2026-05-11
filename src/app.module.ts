import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommunalModule } from './modules/communal/communal.module';
import { IncidenceModule } from './modules/incidence/incidence.module';
import { MunicipalModule } from './modules/municipal/municipal.module';
import { StopModule } from './modules/stop/stop.module';
import { SqlModule } from './modules/sql/sql.module';
import { TypologyModule } from './modules/typology/typology.module';
import { UserModule } from './modules/user/user.module';
import { WasteModule } from './modules/waste/waste.module';
import { DefenseModule } from './modules/defense/defense.module';
import { SustenanceModule } from './modules/sustenance/sustenance.module';
import { ActivityModule } from './modules/activity/activity.module';
import { PnpIncidenceModule } from './modules/pnp-incidence/pnp-incidence.module';
import { AuditModule } from './modules/audit/audit.module';
import { CustomRoleModule } from './modules/custom-role/custom-role.module';
import { ComisariaModule } from './modules/comisaria/comisaria.module';
import { IncidenceTypeModule } from './modules/incidence-type/incidence-type.module';
import { IncidenceSubtypeModule } from './modules/incidence-subtype/incidence-subtype.module';
import { IncidenceModalityModule } from './modules/incidence-modality/incidence-modality.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
    CommunalModule,
    IncidenceModule,
    MunicipalModule,
    PrismaModule,
    StopModule,
    SqlModule,
    TypologyModule,
    UserModule,
    WasteModule,
    DefenseModule,
    SustenanceModule,
    ActivityModule,
    PnpIncidenceModule,
    AuditModule,
    CustomRoleModule,
    ComisariaModule,
    IncidenceTypeModule,
    IncidenceSubtypeModule,
    IncidenceModalityModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
