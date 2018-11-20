import { TalkService } from 'core/services/talk-service'
import { Router } from 'express'
import _ from 'lodash'

import { CustomRouter } from '..'

export class TalkRouter implements CustomRouter {
  public readonly router: Router

  constructor(private talkService: TalkService) {
    this.router = Router({ mergeParams: true })
    this.setupRoutes()
  }

  // Listen for an event that tells the engine is done processing
  // If the event match, return the content[]
  // Check for timeout, if an action is running

  setupRoutes() {
    // bots/{botId}/talk/{userId}?response=nlu;xyz
    this.router.post('/:userId', async (req, res) => {
      const { userId, botId } = req.params
      const payload = req.body

      await this.talkService.sendNewMessage(botId, userId, payload)
      // Return bot response
      return res.status(200)
    })
  }
}
