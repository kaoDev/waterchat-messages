import {
  initEventStoreConnection,
  dispatchServiceEvent,
} from './persistence/eventStore'
import { Server } from 'ws'
import * as rp from 'request-promise'
import websocketConnect from 'rxjs-websockets'
import { QueueingSubject } from 'queueing-subject'
import { Observable } from 'rxjs/Observable'
import { DisplayUser } from './model/User'
import { MessageEvent, USER_LOGGED_IN, USER_LOGGED_OUT } from './events/Events'
import { MessageCommand } from './events/Commands'
import { createEventFromCommand } from './logic/CommandEventMapper'

console.log('initializing micro-auth')

const eventStoreConnectionPromise = initEventStoreConnection()

const unAuthorized = (
  done: (res: boolean, code?: number, message?: string) => void
) => {
  done(false, 401, 'invalid session')
}

const wss = new Server({
  verifyClient: async (info, done) => {
    const sessionId = info.req.headers['sessionId']

    if (
      sessionId === undefined ||
      sessionId === null ||
      sessionId.length === 0
    ) {
      unAuthorized(done)
      return
    } else {
      try {
        await rp.get('https://office.cap3.de:57503/auth/isSessionValid', {
          headers: { sessionId },
        })

        done(true)
      } catch (e) {
        unAuthorized(done)
      }
    }
  },
})

wss.on('connection', async (ws, req) => {
  try {
    await eventStoreConnectionPromise

    const user: DisplayUser = await rp.get(
      `https://office.cap3.de:57503/auth/user/bySession/${req.headers[
        'sessionId'
      ]}`
    )
    dispatchServiceEvent({
      type: USER_LOGGED_IN,
      ...user,
    })

    const input = new QueueingSubject<MessageEvent>()
    const { messages } = websocketConnect('', input, url => ws) as {
      connectionStatus: Observable<number>
      messages: Observable<MessageCommand>
    }
    messages
      .map(createEventFromCommand(user))
      .filter(event => event !== undefined)
      .subscribe((event: MessageEvent) => dispatchServiceEvent(event))

    ws.onclose = event => {
      dispatchServiceEvent({
        type: USER_LOGGED_OUT,
        userId: user.userId,
      })
    }
  } catch (e) {
    ws.close(500, 'internal server error')
  }
})
