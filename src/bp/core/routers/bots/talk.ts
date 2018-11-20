import sdk from 'botpress/sdk'
import { AdminService } from 'core/services/admin/service'
import AuthService from 'core/services/auth/auth-service'
import { CMS } from 'core/services/cms/cms'
import { InvalidParameterError } from 'errors'
import { Router } from 'express'
import _ from 'lodash'

import { CustomRouter } from '..'

export class TalkRouter implements CustomRouter {
  public readonly router: Router

  constructor(private bp: typeof sdk) {
    this.router = Router({ mergeParams: true })
    this.setupRoutes()
  }

  setupRoutes() {
    // bots/{botId}/talk/{userId}?response=nlu;xyz
    this.router.post('/:userId', async (req, res) => {
      const { userId, botId } = req.params
      const payload = req.body
      this.sendNewMessage(botId, userId, payload)
    })
  }

  async sendNewMessage(botId: string, userId: string, payload) {
    if (!payload.text || !_.isString(payload.text) || payload.text.length > 360) {
      throw new InvalidParameterError('Text must be a valid string of less than 360 chars')
    }

    const sanitizedPayload = _.pick(payload, ['text', 'type', 'data', 'raw'])
    const persistedPayload = { ...sanitizedPayload }

    // We remove the password from the persisted messages for security reasons
    if (payload.type === 'login_prompt') {
      persistedPayload.data = _.omit(persistedPayload.data, ['password'])
    }

    if (payload.type === 'form') {
      persistedPayload.data.formId = payload.formId
    }

    const { result: user } = await this.bp.users.getOrCreateUser('api', userId)

    const event = this.bp.IO.Event({
      botId,
      channel: 'api',
      direction: 'incoming',
      payload,
      target: userId,
      type: payload.type
    })

    const message = await this.bp.database.appendUserMessage(botId, userId, persistedPayload)
    return this.bp.events.sendEvent(event)
  }
}
