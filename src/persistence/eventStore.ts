import * as esClient from 'node-eventstore-client'
import { HeartbeatInfo, TcpEndPoint } from 'node-eventstore-client'
import * as uuid from 'uuid'
import {
  ServiceEvent,
  MESSAGE_RECEIVED,
  SERVICE_STARTED,
  MessageReceived,
} from '../events/Events'
import { State } from '../model/State'
import { PUBLIC_CHANNEL_ID } from '../model/Channel'
import { reduceServiceState, initialState } from '../logic/StateUpdater'
import { authorizeEvent, isServiceEvent } from '../logic/EventAuthorizer'
import { ReplaySubject, BehaviorSubject, Observable } from 'rxjs'

const serviceEventStream = 'messageService'

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

const digetStoreEvent = (messageSubject: ReplaySubject<ServiceEvent>) => (
  subscription: any,
  event: esClient.ResolvedEvent
) => {
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

export const createStreamSubscription = async (
  messageSubject: ReplaySubject<ServiceEvent> = new ReplaySubject<ServiceEvent>(
    5000
  )
) => {
  console.log('create event-store stream')

  const connection = await initEventStoreConnection()

  const digest = digetStoreEvent(messageSubject)
  await dispatchServiceEvent({ type: SERVICE_STARTED })
  const storeCatchUpSubscription = await connection.subscribeToStreamFrom(
    serviceEventStream,
    0,
    false,
    digest,
    async sub => {
      console.log('all events digested live streaming now')
      sub.stop()

      const liveSubscription = await connection.subscribeToStream(
        serviceEventStream,
        false,
        digest
      )

      messageSubject.subscribe(undefined, undefined, () => {
        liveSubscription.unsubscribe()
      })
    },
    () => {
      console.log('subscription dropped')
    }
  )

  messageSubject.subscribe(undefined, undefined, () => {
    storeCatchUpSubscription.stop()
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
        return esConnection
          .appendToStream(
            serviceEventStream,
            esClient.expectedVersion.any,
            storeEvent
          )
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
  console.log('init event store sub')

  eventStream
    .zip(serviceState, (event, state) => {
      return { state, event }
    })
    .flatMap(({ state, event }) => {
      return Observable.fromPromise(reduceServiceState(state, event))
    })
    .subscribe(nextState => {
      console.log('state update', 'users', nextState.users.length)

      serviceState.next(nextState)
    })
}
initStateSubscription()
