import * as esClient from 'node-eventstore-client'
import { HeartbeatInfo, TcpEndPoint, Position } from 'node-eventstore-client'
import * as uuid from 'uuid'
import {
  ServiceEvent,
  MESSAGE_RECEIVED,
  MessageReceived,
} from '../events/Events'
import { State } from '../model/State'
import { PUBLIC_CHANNEL_ID } from '../model/Channel'
import { reduceServiceState, initialState } from '../logic/StateUpdater'
import { authorizeEvent, isServiceEvent } from '../logic/EventAuthorizer'
import { ReplaySubject, BehaviorSubject, Observable } from 'rxjs'

const serviceEventStream = 'messageService'
const messageChannelStream = (channelName: string) =>
  `messageService_channel_${channelName}`

const host = 'eventstore'
const tcpPort = '1113'
const httpPort = '2113'

const credentials = new esClient.UserCredentials('admin', 'changeit')
const esConnection = esClient.createConnection(
  {
    defaultUserCredentials: credentials,
  },
  `tcp://${host}:${tcpPort}`
)

export const createChannelSubscription = async (channelName: string) => {
  const stream = await getServiceEventStream()
  return stream
    .filter(e => e.type === MESSAGE_RECEIVED && e.channelId === channelName)
    .do(e => console.log(e.type)) as Observable<MessageReceived>
}

export const createStreamSubscription = async (
  messageSubject: ReplaySubject<ServiceEvent> = new ReplaySubject<ServiceEvent>(
    5000
  )
) => {
  const connection = await initEventStoreConnection()

  const storeSubscription = await connection.subscribeToAllFrom(
    new Position(0, 0),
    false,
    (subscription, event) => {
      if (
        event.originalEvent !== undefined &&
        event.originalEvent.data !== undefined
      ) {
        const parsedEvent = JSON.parse(
          event.originalEvent.data.toString()
        ) as ServiceEvent

        if (isServiceEvent(parsedEvent)) {
          messageSubject.next(parsedEvent)
        }
      }
    }
  )

  messageSubject.subscribe(undefined, undefined, () => {
    storeSubscription.stop()
  })

  return messageSubject
}

esConnection.on('connected', tcpEndPoint => {
  if (tcpEndPoint instanceof Error) {
    console.error('got error instead of endpoint object', tcpEndPoint)
  } else if (typeof tcpEndPoint === 'string') {
    console.error('got string instead of endpoint object', tcpEndPoint)
  } else {
    if ((tcpEndPoint as TcpEndPoint).host) {
      console.log(
        `Connected to eventstore at ${(tcpEndPoint as TcpEndPoint)
          .host}:${(tcpEndPoint as TcpEndPoint).port}`
      )
    } else {
      const endpoint = (tcpEndPoint as HeartbeatInfo).remoteEndPoint

      console.log(
        `Connected to eventstore at ${endpoint.host}:${endpoint.port}`
      )
    }
  }
})

const connected = esConnection.connect()

export async function initEventStoreConnection() {
  await connected
  return esConnection
}

export async function dispatchServiceEvent(
  event: ServiceEvent,
  channelName: string = PUBLIC_CHANNEL_ID
) {
  console.log('dispatching service event')
  const eventId = event.type === MESSAGE_RECEIVED ? event.messageId : uuid.v4()
  const storeEvent = esClient.createJsonEventData(
    eventId,
    event,
    null,
    event.type
  )

  console.log(storeEvent.data.toString())
  console.log('Appending...')

  await serviceState
    .take(1)
    .map(state => authorizeEvent(state)(event))
    .flatMap(valid => {
      if (valid) {
        let streamName = serviceEventStream
        switch (event.type) {
          case MESSAGE_RECEIVED:
            streamName = messageChannelStream(channelName)
            break
        }
        return esConnection
          .appendToStream(streamName, esClient.expectedVersion.any, storeEvent)
          .then(result => {
            console.log('Stored event:', eventId)
            console.log(
              `Look for it at: http://${host}:${httpPort}/web/index.html#/streams/${serviceEventStream}`
            )
          })
          .catch(err => {
            console.error(err)
          })
      }
      console.log('invalid event', event)
      throw new Error('Invalid Event')
    })
    .toPromise()
    .catch((error: Error) => console.error(error))
}

export const serviceState = new BehaviorSubject<State>(initialState)

let serviceEvent$: Observable<ServiceEvent> | null = null
export const getServiceEventStream = async () => {
  if (serviceEvent$ !== null) {
    return serviceEvent$
  } else {
    serviceEvent$ = await createStreamSubscription()

    return serviceEvent$
  }
}

const initStateSubscription = async () => {
  const eventStream = await getServiceEventStream()

  eventStream
    .withLatestFrom(serviceState, (event, state) => {
      return { state, event }
    })
    .subscribe(async ({ state, event }) => {
      const nextState = await reduceServiceState(state, event)
      console.log('state update')
      console.log('online users', state.users.length)
      serviceState.next(nextState)
    })
}
initStateSubscription()
