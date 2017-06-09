export type UserId = {
  readonly userId: string
}

export type UserDisplayName = {
  readonly displayName: string
}

export type ProfilePicture = {
  readonly profilePicture: string
}

export type SessionId = {
  readonly sessionId: string
}

export type DisplayUser = UserId & UserDisplayName & ProfilePicture
