import LicensingService from 'common/licensing-service'
import { DialogContainerModule } from 'core/services/dialog/dialog.inversify'
import { ContainerModule, interfaces } from 'inversify'

import { TYPES } from '../types'

import ActionService from './action/action-service'
import { AdminContainerModule } from './admin/admin.inversify'
import AuthService from './auth/auth-service'
import { CMS } from './cms/cms'
import { ContentElementSender } from './cms/content-sender'
import { SkillService } from './dialog/skill/service'
import { GhostContainerModule } from './ghost/ghost.inversify'
import { HookService } from './hook/hook-service'
import { KeyValueStore } from './kvs/kvs'
import CELicensingService from './licensing'
import { LogsJanitor } from './logs/janitor'
import { LogsService } from './logs/service'
import MediaService from './media'
import { EventEngine } from './middleware/event-engine'
import { NotificationsService } from './notification/service'
import { Queue } from './queue'
import MemoryQueue from './queue/memory-queue'
import RealtimeService from './realtime'
import { TalkService } from './talk-service'

const ServicesContainerModule = new ContainerModule((bind: interfaces.Bind) => {
  bind<CMS>(TYPES.CMS)
    .to(CMS)
    .inSingletonScope()

  bind<MediaService>(TYPES.MediaService)
    .to(MediaService)
    .inSingletonScope()

  bind<ActionService>(TYPES.ActionService)
    .to(ActionService)
    .inSingletonScope()

  bind<LicensingService>(TYPES.LicensingService)
    .to(CELicensingService)
    .inSingletonScope()
    .when(() => process.BOTPRESS_EDITION === 'ce')

  bind<Queue>(TYPES.IncomingQueue).toDynamicValue((context: interfaces.Context) => {
    return new MemoryQueue('Incoming', context.container.getTagged(TYPES.Logger, 'name', 'IQueue'))
  })

  bind<Queue>(TYPES.OutgoingQueue).toDynamicValue((context: interfaces.Context) => {
    return new MemoryQueue('Outgoing', context.container.getTagged(TYPES.Logger, 'name', 'OQueue'))
  })

  bind<HookService>(TYPES.HookService)
    .to(HookService)
    .inSingletonScope()

  bind<EventEngine>(TYPES.EventEngine)
    .to(EventEngine)
    .inSingletonScope()

  bind<RealtimeService>(TYPES.RealtimeService)
    .to(RealtimeService)
    .inSingletonScope()

  bind<AuthService>(TYPES.AuthService)
    .to(AuthService)
    .inSingletonScope()

  bind<LogsJanitor>(TYPES.LogJanitorRunner)
    .to(LogsJanitor)
    .inSingletonScope()

  bind<LogsService>(TYPES.LogsService)
    .to(LogsService)
    .inSingletonScope()

  bind<NotificationsService>(TYPES.NotificationsService)
    .to(NotificationsService)
    .inSingletonScope()

  bind<KeyValueStore>(TYPES.KeyValueStore)
    .to(KeyValueStore)
    .inSingletonScope()

  bind<ContentElementSender>(TYPES.ContentElementSender)
    .to(ContentElementSender)
    .inSingletonScope()

  bind<SkillService>(TYPES.SkillService)
    .to(SkillService)
    .inSingletonScope()

  bind<TalkService>(TYPES.TalkService)
    .to(TalkService)
    .inSingletonScope()
})

export const ServicesContainerModules = [
  ServicesContainerModule,
  AdminContainerModule,
  DialogContainerModule,
  GhostContainerModule
]
