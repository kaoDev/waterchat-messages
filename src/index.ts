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
  ONLINE_USERS_CHANGED,
  OnlineUsersChanged,
  ServiceEvent,
} from './events/Events'
import { createEventFromCommand } from './logic/CommandEventMapper'
import { parse } from 'query-string'
import { Observable } from 'rxjs/Observable'
import { Subscription } from 'rxjs/Subscription'

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
  let subscription: Subscription | undefined
  let user: DisplayUser | undefined

  const userAlive = Observable.interval(10000)
    .map(() => ws.readyState)
    .map(status => status !== WebSocket.CLOSED)
    .filter(state => state !== true)

  try {
    console.log('new connection')
    await eventStoreConnectionPromise
    console.log('got eventstore connection')

    const cleanedQuery = cleanQuery(req.url)

    const { sessionId } = parse(cleanedQuery) as { sessionId: string }

    console.log('got session id', sessionId)

    user = JSON.parse(await rp.get(`http://micro-auth:3000/user/${sessionId}`))

    if (user !== undefined) {
      console.log('got user', user)

      await dispatchServiceEvent({
        type: USER_LOGGED_IN,
        ...user,
      })

      const chatMessages: Observable<ServiceEvent> = serviceState
        .flatMap(state => state.activeChannels)
        .filter(
          channel =>
            channel.userIds.some(
              id => user !== undefined && id === user.userId
            ) || channel.channelId === PUBLIC_CHANNEL_ID
        )
        .distinct(channel => channel.channelId)
        .flatMap(channel => channel.messages)

      const onlineUsers: Observable<OnlineUsersChanged> = serviceState
        .map(state => state.users)
        .distinct()
        .map(users => ({
          type: ONLINE_USERS_CHANGED,
          users,
        }))

      subscription = Observable.merge(chatMessages, onlineUsers)
        .takeUntil(userAlive)
        .subscribe(
          message => ws.send(JSON.stringify(message)),
          e => console.error('error in channel subscription', e),
          () => {
            if (user !== undefined) {
              dispatchServiceEvent({
                type: USER_LOGGED_OUT,
                userId: user.userId,
              })
              user = undefined
              if (
                ws.readyState !== WebSocket.CLOSED ||
                ws.readyState !== WebSocket.CLOSING
              ) {
                ws.close()
              }
            }
          }
        )

      ws.onmessage = message => {
        try {
          if (message.data === 'ping') {
            ws.send(JSON.stringify({ ping: 'pong' }))
          } else if (user !== undefined) {
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
          }
        } catch (e) {
          console.error('error on message receive', e)
        }
      }

      ws.onclose = event => {
        if (subscription) {
          subscription.unsubscribe()
          subscription = undefined
        }
        if (user !== undefined) {
          dispatchServiceEvent({
            type: USER_LOGGED_OUT,
            userId: user.userId,
          })
          user = undefined
        }
      }
    }
  } catch (e) {
    console.error('unhandled error in websocket code', e)
    ws.close(500, 'internal server error')
  } finally {
    if (subscription) {
      subscription.unsubscribe()
    }
    if (user !== undefined) {
      dispatchServiceEvent({
        type: USER_LOGGED_OUT,
        userId: user.userId,
      })
    }
  }
})
