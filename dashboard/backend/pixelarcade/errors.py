"""Eccezioni di dominio di Pixel Arcade.

L'API traduce queste eccezioni in risposte JSON ``{"error": messaggio}``.
I messaggi sono in italiano perché arrivano all'interfaccia.
"""


class PixelArcadeError(Exception):
    """Errore di dominio con un messaggio da mostrare all'utente.

    ``data`` (facoltativo) aggiunge campi alla risposta JSON dell'API.
    """

    status = 400

    def __init__(self, message='', data=None):
        super().__init__(message)
        self.data = data


class ConflictError(PixelArcadeError):
    """Operazione non possibile nello stato attuale (per esempio durante una partita)."""

    status = 409


class ConfigError(PixelArcadeError):
    """Impostazioni non valide o non leggibili."""


class LibraryError(PixelArcadeError):
    """Problema nella scansione o nella lettura della libreria."""


class LaunchError(PixelArcadeError):
    """Avvio di un gioco non riuscito."""


class IncompatibleError(LaunchError):
    """Nessun core compatibile: tutti i candidati sono già stati provati."""

    status = 409


class RetroArchError(PixelArcadeError):
    """RetroArch non risponde ai comandi di rete o non ha eseguito il comando."""

    status = 502


class SaveError(PixelArcadeError):
    """Operazione non valida su un salvataggio (slot inesistente o non modificabile)."""


class ProfileError(PixelArcadeError):
    """Operazione non valida su un profilo."""


class DuplicateNameError(ProfileError):
    """Esiste già un profilo con quel nome (senza distinguere maiuscole e minuscole)."""

    status = 409


class PlaylistError(PixelArcadeError):
    """Operazione non valida su una playlist (nome, filtri o gioco non validi)."""


class DatabaseError(PixelArcadeError):
    """Errore del database o di una migrazione."""

    status = 500


class WrappedError(PixelArcadeError):
    """Wrapped non disponibile: periodo non valido, non ancora chiuso o con troppe poche partite."""


class ChallengeError(PixelArcadeError):
    """Sfida trofeo inesistente, scaduta o non giocabile, oppure scelta dei trofei non valida."""


class TournamentError(PixelArcadeError):
    """Torneo inesistente o campo non valido."""


class TournamentLockedError(TournamentError):
    """Operazione sul torneo non permessa: profilo diverso dal creatore o combinazione sbagliata.

    La risposta ha ``locked: true``.
    """

    def __init__(self, message=''):
        super().__init__(message, {'locked': True})
