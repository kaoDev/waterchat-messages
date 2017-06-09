import {
  initEventStoreConnection,
  dispatchServiceEvent,
  serviceState,
} from './persistence/eventStore'
import { Server } from 'ws'
import * as rp from 'request-promise'
import { DisplayUser } from './model/User'
import { PUBLIC_CHANNEL_ID } from './model/Channel'
import {
  USER_LOGGED_IN,
  USER_LOGGED_OUT,
  MESSAGE_RECEIVED,
} from './events/Events'
import { createEventFromCommand } from './logic/CommandEventMapper'
import { parse } from 'query-string'

console.log('initializing message service')

const eventStoreConnectionPromise = initEventStoreConnection().catch(() => {})

const unAuthorized = (
  done: (res: boolean, code?: number, message?: string) => void
) => {
  done(false, 401, 'invalid session')
}

const cleanQuery = (query: string = '') => {
  console.log('CLEAN QUERY', query)

  if (query.indexOf('/?') === 0) {
    console.log('remove query prefix')

    return query.slice(2)
  } else {
    return query
  }
}

const wss = new Server({
  verifyClient: async (info, done) => {
    const sessionId = parse(cleanQuery(info.req.url))

    if (
      sessionId === undefined ||
      sessionId === null ||
      sessionId.length === 0
    ) {
      unAuthorized(done)
      return
    } else {
      try {
        console.log('request validation for session ', sessionId)
        await rp.get('http://micro-auth:3000/isSessionValid', {
          headers: sessionId,
        })
        console.log('validation success')

        done(true)
      } catch (e) {
        console.log('validation error', e)
        unAuthorized(done)
      }
    }
  },
  port: 4000,
})

wss.on('connection', async (ws, req) => {
  try {
    console.log('new connection')
    await eventStoreConnectionPromise
    console.log('got eventstore connection')

    const cleanedQuery = cleanQuery(req.url)

    const { sessionId } = parse(cleanedQuery) as { sessionId: string }

    console.log('got session id', sessionId)

    const user: DisplayUser = JSON.parse(
      await rp.get(`http://micro-auth:3000/user/${sessionId}`)
    )

    console.log('got user', user)

    await dispatchServiceEvent({
      type: USER_LOGGED_IN,
      userId: user.userId,
      displayName: user.displayName,
    })

    const subscription = serviceState
      .flatMap(state => state.activeChannels)
      .do(() => console.log('got new service state'))
      .filter(
        channel =>
          channel.userIds.some(id => id === user.userId) ||
          channel.channelId === PUBLIC_CHANNEL_ID
      )
      .distinct(channel => channel.channelId)
      .flatMap(channel => channel.messages)
      .do(m => console.log('sending message to client', m))
      .subscribe(
        message => ws.send(JSON.stringify(message)),
        e => console.error('error in channel subscription', e)
      )

    serviceState
      .flatMap(state => state.activeChannels)
      .do(() => console.log('got new service state'))
      .filter(
        channel =>
          channel.userIds.some(id => id === user.userId) ||
          channel.channelId === PUBLIC_CHANNEL_ID
      )
      .distinct(channel => channel.channelId)
      .flatMap(channel => channel.messages)

    ws.onmessage = message => {
      try {
        const command = JSON.parse(message.data.toString())
        const event = createEventFromCommand(user)(command)
        if (event !== undefined) {
          if (event.type === MESSAGE_RECEIVED) {
            dispatchServiceEvent(event, event.channelId)
          } else {
            dispatchServiceEvent(event)
          }
        } else {
          console.log('wrong command format', command)
        }
      } catch (e) {
        console.error('error on message receive', e)
      }
    }

    ws.onclose = event => {
      subscription.unsubscribe()
      dispatchServiceEvent({
        type: USER_LOGGED_OUT,
        userId: user.userId,
      })
    }
  } catch (e) {
    console.error('unhandled error in websocket code', e)
    ws.close(500, 'internal server error')
  }
})
