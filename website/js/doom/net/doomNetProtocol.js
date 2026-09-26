/**
 * The control messages of a multiplayer session and their vocabulary: what the
 * main and a sub say to each other outside the turn stream (JSON, through
 * NetPeer.sendControl).
 */
class DoomNetProtocol {
}

// Main → every sub: the lobby as it stands (DoomNetLobby.toData).
DoomNetProtocol.LOBBY       = 'lobby';
// Main → every sub: the game runs.
DoomNetProtocol.START       = 'start';
// Either side: the session ends for the receiver, with one of the END_* reasons.
DoomNetProtocol.SESSION_END = 'sessionEnd';

DoomNetProtocol.END_STOPPED = 'stopped';   // the main stopped the session
DoomNetProtocol.END_REMOVED = 'removed';   // the main removed that sub
DoomNetProtocol.END_LEFT    = 'left';      // the sub left
DoomNetProtocol.END_LOST    = 'lost';      // the link went silent or failed

DoomNetProtocol.MODE_SCREEN_SHARING = 1;

// A side that ends a session closes the link itself if the other side has not
// done it by then: its closing message must get through first.
DoomNetProtocol.END_GRACE_MS = 1000;
