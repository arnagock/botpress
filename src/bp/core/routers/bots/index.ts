/*---------------------------------------------------------------------------------------------
*  Copyright (c) Botpress, Inc. All rights reserved.
*  Licensed under the AGPL-3.0 license. See license.txt at project root for more information.
*--------------------------------------------------------------------------------------------*/

import { Serialize } from 'cerialize'
import { BotRepository } from 'core/repositories'
import { GhostService } from 'core/services'
import ActionService from 'core/services/action/action-service'
import { AdminService } from 'core/services/admin/service'
import AuthService, { TOKEN_AUDIENCE } from 'core/services/auth/auth-service'
import { FlowView } from 'core/services/dialog'
import { FlowService } from 'core/services/dialog/flow/service'
import { LogsService } from 'core/services/logs/service'
import MediaService from 'core/services/media'
import { NotificationsService } from 'core/services/notification/service'
import { RequestHandler, Router } from 'express'
import _ from 'lodash'
import moment from 'moment'
import ms from 'ms'
import multer from 'multer'
import path from 'path'
import { RouterOptions } from 'request'

import { CustomRouter } from '..'
import { checkTokenHeader, needPermissions } from '../util'

export class BotsRouter implements CustomRouter {
  public readonly router: Router

  private actionService: ActionService
  private botRepository: BotRepository
  private flowService: FlowService
  private mediaService: MediaService
  private logsService: LogsService
  private notificationService: NotificationsService
  private authService: AuthService
  private adminService: AdminService
  private ghostService: GhostService

  private _checkTokenHeader: RequestHandler
  private _needPermissions: (operation: string, resource: string) => RequestHandler

  constructor(args: {
    actionService: ActionService
    botRepository: BotRepository
    flowService: FlowService
    mediaService: MediaService
    logsService: LogsService
    notificationService: NotificationsService
    authService: AuthService
    adminService: AdminService
    ghostService: GhostService
  }) {
    this.actionService = args.actionService
    this.botRepository = args.botRepository
    this.flowService = args.flowService
    this.mediaService = args.mediaService
    this.logsService = args.logsService
    this.notificationService = args.notificationService
    this.authService = args.authService
    this.adminService = args.adminService
    this.ghostService = args.ghostService

    this._needPermissions = needPermissions(this.adminService)
    this._checkTokenHeader = checkTokenHeader(this.authService, TOKEN_AUDIENCE)

    this.router = Router({ mergeParams: true })
    this.setupRoutes()
  }

  getNewRouter(path: string, options: RouterOptions) {
    const router = Router({ mergeParams: true })
    this.router.use('/mod/' + path, router)
    return router
  }

  private studioParams(botId) {
    return {
      botId,
      authentication: {
        tokenDuration: ms('6h')
      },
      sendStatistics: true, // TODO Add way to opt out
      showGuidedTour: false, // TODO
      ghostEnabled: this.ghostService.isGhostEnabled,
      flowEditorDisabled: !process.IS_LICENSED,
      botpress: {
        name: 'Botpress Server',
        version: process.BOTPRESS_VERSION
      },
      isLicensed: process.IS_LICENSED,
      edition: process.BOTPRESS_EDITION
    }
  }

  private setupRoutes() {
    // Unauthenticated, don't return sensitive info here
    this.router.get('/studio-params', async (req, res) => {
      const info = this.studioParams(req.params.botId)
      res.send(info)
    })

    this.router.get('/:app(studio|lite)/js/env.js', async (req, res) => {
      const { botId, app } = req.params
      const data = this.studioParams(botId)
      const liteEnv = `
              // Lite Views Specific
          `
      const studioEnv = `
              // Botpress Studio Specific
              window.AUTH_TOKEN_DURATION = ${data.authentication.tokenDuration};
              window.OPT_OUT_STATS = ${!data.sendStatistics};
              window.SHOW_GUIDED_TOUR = ${data.showGuidedTour};
              window.GHOST_ENABLED = ${data.ghostEnabled};
              window.BOTPRESS_FLOW_EDITOR_DISABLED = ${data.flowEditorDisabled};
              window.BOTPRESS_CLOUD_SETTINGS = {"botId":"","endpoint":"","teamId":"","env":"dev"};
              window.IS_LICENSED = ${data.isLicensed};
              window.EDITION = '${data.edition}';
          `

      const totalEnv = `
          (function(window) {
              // Common
              window.API_PATH = "/api/v1";
              window.BOT_API_PATH = "/api/v1/bots/${botId}";
              window.BOT_ID = "${botId}";
              window.BP_BASE_PATH = "/${app}/${botId}";
              window.BOTPRESS_VERSION = "${data.botpress.version}";
              window.APP_NAME = "${data.botpress.name}";
              window.NODE_ENV = "production";
              window.BOTPRESS_ENV = "dev";
              window.BOTPRESS_CLOUD_ENABLED = false;
              window.DEV_MODE = true;
              ${app === 'studio' ? studioEnv : ''}
              ${app === 'lite' ? liteEnv : ''}
              // End
            })(typeof window != 'undefined' ? window : {})
          `

      res.contentType('text/javascript')
      res.send(totalEnv)
    })

    this.router.get('/', this._checkTokenHeader, this._needPermissions('read', 'bot.information'), async (req, res) => {
      const botId = req.params.botId
      const bot = await this.botRepository.getBotById(botId)

      res.send(bot)
    })

    this.router.get('/flows', this._checkTokenHeader, this._needPermissions('read', 'bot.flows'), async (req, res) => {
      const botId = req.params.botId
      const flows = await this.flowService.loadAll(botId)
      res.send(flows)
    })

    this.router.post(
      '/flows',
      this._checkTokenHeader,
      this._needPermissions('write', 'bot.flows'),
      async (req, res) => {
        const botId = req.params.botId
        const flowViews = <FlowView[]>req.body

        await this.flowService.saveAll(botId, flowViews)
        res.sendStatus(201)
      }
    )

    this.router.get(
      '/actions',
      this._checkTokenHeader,
      this._needPermissions('read', 'bot.flows'),
      async (req, res) => {
        const botId = req.params.botId
        const actions = await this.actionService.forBot(botId).listActions({ includeMetadata: true })
        res.send(Serialize(actions))
      }
    )

    const mediaUploadMulter = multer({
      limits: {
        fileSize: 1024 * 1000 * 10 // 10mb
      }
    })

    // This is not a bug: do not authenticate this route
    this.router.get('/media/:filename', async (req, res) => {
      const botId = req.params.botId
      const type = path.extname(req.params.filename)

      const contents = await this.mediaService.readFile(botId, req.params.filename).catch(() => undefined)
      if (!contents) {
        return res.sendStatus(404)
      }

      // files are never overwritten because of the unique ID
      // so we can set the header to cache the asset for 1 year
      return res
        .set({ 'Cache-Control': 'max-age=31556926' })
        .type(type)
        .send(contents)
    })

    this.router.post(
      '/media',
      this._checkTokenHeader,
      this._needPermissions('write', 'bot.media'),
      mediaUploadMulter.single('file'),
      async (req, res) => {
        const botId = req.params.botId
        const fileName = await this.mediaService.saveFile(botId, req['file'].originalname, req['file'].buffer)
        const url = `/api/v1/bots/${botId}/media/${fileName}`
        res.json({ url })
      }
    )

    this.router.get('/logs', this._checkTokenHeader, this._needPermissions('read', 'bot.logs'), async (req, res) => {
      const limit = req.query.limit
      const botId = req.params.botId
      const logs = await this.logsService.getLogsForBot(botId, limit)
      res.send(logs)
    })

    this.router.get(
      '/logs/archive',
      this._checkTokenHeader,
      this._needPermissions('read', 'bot.logs'),
      async (req, res) => {
        const botId = req.params.botId
        const logs = await this.logsService.getLogsForBot(botId)
        res.setHeader('Content-type', 'text/plain')
        res.setHeader('Content-disposition', 'attachment; filename=logs.txt')
        res.send(
          logs
            .map(({ timestamp, level, message }) => {
              const time = moment(new Date(timestamp)).format('MMM DD HH:mm:ss')
              return `${time} ${level}: ${message}`
            })
            .join('\n')
        )
      }
    )

    this.router.get(
      '/notifications',
      this._checkTokenHeader,
      this._needPermissions('read', 'bot.notifications'),
      async (req, res) => {
        const botId = req.params.botId
        const notifications = await this.notificationService.getInbox(botId)
        res.send(notifications)
      }
    )

    this.router.get(
      '/notifications/archive',
      this._checkTokenHeader,
      this._needPermissions('read', 'bot.notifications'),
      async (req, res) => {
        const botId = req.params.botId
        const notifications = await this.notificationService.getArchived(botId)
        res.send(notifications)
      }
    )

    this.router.post(
      '/notifications/:notificationId?/read',
      this._checkTokenHeader,
      this._needPermissions('write', 'bot.notifications'),
      async (req, res) => {
        const notificationId = req.params.notificationId
        const botId = req.params.botId

        notificationId
          ? await this.notificationService.markAsRead(notificationId)
          : await this.notificationService.markAllAsRead(botId)
        res.sendStatus(201)
      }
    )

    this.router.post(
      '/notifications/:notificationId?/archive',
      this._checkTokenHeader,
      this._needPermissions('write', 'bot.notifications'),
      async (req, res) => {
        const notificationId = req.params.notificationId
        const botId = req.params.botId
        notificationId
          ? await this.notificationService.archive(notificationId)
          : await this.notificationService.archiveAll(botId)
        res.sendStatus(201)
      }
    )
  }
}
