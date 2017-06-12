import { ServiceEvent, USER_LOGGED_OUT, USER_LOGGED_IN } from '../events/Events'
import { State, UserConnection } from '../model/State'
import { PUBLIC_CHANNEL_ID, ActiveChannel, Channel } from '../model/Channel'
import { DisplayUser } from '../model/User'
import { createChannelSubscription } from '../persistence/eventStore'

export const initialState: State = Object.freeze({
  connections: [],
  users: [],
  activeChannels: [],
  inactiveChannels: [
    {
      channelId: PUBLIC_CHANNEL_ID,
      userIds: [],
    },
  ],
})

const reduceConnections = (
  connections: UserConnection[] = [],
  event: ServiceEvent
) => {
  switch (event.type) {
    case USER_LOGGED_IN:
      if (connections.some(con => con.userId === event.userId)) {
        return connections.map(con => {
          if (con.userId === event.userId) {
            return {
              ...con,
              connectionCount: con.connectionCount + 1,
            }
          } else {
            return con
          }
        })
      } else {
        return connections.concat([
          {
            connectionCount: 1,
            userId: event.userId,
          },
        ])
      }
    case USER_LOGGED_OUT:
      return connections
        .map(con => {
          if (con.userId === event.userId) {
            return {
              ...con,
              connectionCount: con.connectionCount - 1,
            }
          } else {
            return con
          }
        })
        .filter(con => con.connectionCount <= 0)
    default:
      return connections
  }
}

const reduceUsers = (nextConnections: UserConnection[]) => (
  users: DisplayUser[] = [],
  event: ServiceEvent
) => {
  switch (event.type) {
    case USER_LOGGED_IN:
      const user: DisplayUser = {
        userId: event.userId,
        displayName: event.displayName,
        profilePicture: event.profilePicture,
      }
      if (users.every(u => u.userId !== event.userId)) {
        return users.concat(user)
      } else {
        return users.map(u => {
          if (u.userId === event.userId) {
            return user
          } else {
            return u
          }
        })
      }
    case USER_LOGGED_OUT:
      if (nextConnections.some(con => con.userId === event.userId)) {
        return users
      } else {
        return users.filter(u => u.userId !== event.userId)
      }
    default:
      return users
  }
}

const reduceActiveChannels = (
  nextConnections: UserConnection[],
  inactiveChannels: Channel[]
) => async (activeChannels: ActiveChannel[] = [], event: ServiceEvent) => {
  switch (event.type) {
    case USER_LOGGED_IN:
      const newActiveChannels = await Promise.all(
        inactiveChannels
          .filter(
            ch =>
              ch.userIds.some(id => id === event.userId) ||
              (ch.channelId === PUBLIC_CHANNEL_ID && nextConnections.length > 0)
          )
          .map(async ch => ({
            ...ch,
            messages: await createChannelSubscription(ch.channelId),
          }))
      )
      return activeChannels.concat(newActiveChannels)
    case USER_LOGGED_OUT:
      return activeChannels.filter(ch => {
        const keep = ch.userIds.some(id =>
          nextConnections.some(con => con.userId === id)
        )

        return keep
      })

    default:
      return activeChannels
  }
}

const reduceInactiveChannels = (
  nextConnections: UserConnection[],
  activeChannels: ActiveChannel[]
) => (inactiveChannels: Channel[] = [], event: ServiceEvent) => {
  switch (event.type) {
    case USER_LOGGED_IN:
      return inactiveChannels.filter(ch =>
        ch.userIds.every(id => id !== event.userId)
      )
    case USER_LOGGED_OUT:
      const newInactiveChannels = activeChannels.filter(ch =>
        ch.userIds.every(id => nextConnections.every(con => con.userId !== id))
      )
      return inactiveChannels.concat(newInactiveChannels)
    default:
      return inactiveChannels
  }
}

export const reduceServiceState = async (
  state: State = initialState,
  event: ServiceEvent
): Promise<State> => {
  const connections = reduceConnections(state.connections, event)
  const activeChannels = await reduceActiveChannels(
    connections,
    state.inactiveChannels
  )(state.activeChannels, event)
  return {
    connections,
    activeChannels,
    inactiveChannels: reduceInactiveChannels(connections, state.activeChannels)(
      state.inactiveChannels,
      event
    ),
    users: reduceUsers(connections)(state.users, event),
  }
}
