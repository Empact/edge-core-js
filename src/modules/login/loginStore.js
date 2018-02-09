// @flow

import { mapFiles } from 'disklet'

import type { DiskletFile, DiskletFolder } from '../../edge-core-index.js'
import { base58, base64 } from '../../util/encoding.js'
import type { ApiInput } from '../root.js'
import { scrypt, userIdSnrp } from '../scrypt/scrypt-selectors.js'
import type { LoginStash } from './login-types.js'

export type LoginIdMap = { [loginId: string]: string }

export type FileInfo = {
  file: DiskletFile,
  json: Object
}

function loginsFolder (ai: ApiInput) {
  return ai.props.io.folder.folder('logins')
}

function getJsonFiles (folder: DiskletFolder): Promise<Array<FileInfo>> {
  return mapFiles(folder, file =>
    file
      .getText()
      .then(text => ({ file, json: JSON.parse(text) }))
      .catch(e => void 0)
  ).then(files => files.filter(file => file != null))
}

function findUserFile (folder, username) {
  const fixedName = fixUsername(username)
  return getJsonFiles(folder).then(files =>
    files.find(file => file.json.username === fixedName)
  )
}

/**
 * Lists the usernames that have data in the store.
 */
export function listUsernames (ai: ApiInput): Promise<Array<string>> {
  return getJsonFiles(loginsFolder(ai)).then(files =>
    files.map(file => file.json.username)
  )
}

/**
 * Creates a map from loginIds to usernames.
 */
export function mapLoginIds (ai: ApiInput): Promise<LoginIdMap> {
  return getJsonFiles(loginsFolder(ai)).then(files => {
    const out: LoginIdMap = {}
    for (const file of files) {
      out[file.json.loginId] = file.json.username
    }
    return out
  })
}

/**
 * Finds the login stash for the given username.
 * Returns a default object if
 */
export function loadUsername (
  ai: ApiInput,
  username: string
): Promise<LoginStash> {
  return findUserFile(loginsFolder(ai), username).then(
    file =>
      file != null ? file.json : { username: fixUsername(username), appId: '' }
  )
}

/**
 * Removes any login stash that may be stored for the given username.
 */
export function removeUsername (ai: ApiInput, username: string): Promise<void> {
  return findUserFile(loginsFolder(ai), username).then(
    file => (file != null ? file.file.delete() : void 0)
  )
}

/**
 * Saves a login stash tree to the folder.
 */
export function saveUsername (ai: ApiInput, stashTree: LoginStash) {
  if (stashTree.appId !== '') {
    throw new Error('Cannot save a login without an appId.')
  }
  if (!stashTree.loginId) {
    throw new Error('Cannot save a login without a loginId.')
  }
  const loginId = base64.parse(stashTree.loginId)
  if (loginId.length !== 32) {
    throw new Error('Invalid loginId')
  }
  const filename = base58.stringify(loginId) + '.json'
  return loginsFolder(ai)
    .file(filename)
    .setText(JSON.stringify(stashTree))
}

/**
 * Normalizes a username, and checks for invalid characters.
 * TODO: Support a wider character range via Unicode normalization.
 */
export function fixUsername (username: string) {
  const out = username
    .toLowerCase()
    .replace(/[ \f\r\n\t\v]+/g, ' ')
    .replace(/ $/, '')
    .replace(/^ /, '')

  for (let i = 0; i < out.length; ++i) {
    const c = out.charCodeAt(i)
    if (c < 0x20 || c > 0x7e) {
      throw new Error('Bad characters in username')
    }
  }
  return out
}

// Hashed username cache:
const userIdCache = {}

/**
 * Hashes a username into a userId.
 */
export function hashUsername (
  ai: ApiInput,
  username: string
): Promise<Uint8Array> {
  const fixedName = fixUsername(username)
  if (userIdCache[fixedName] == null) {
    userIdCache[fixedName] = scrypt(ai, fixedName, userIdSnrp)
  }
  return userIdCache[fixedName]
}
