//! Tickets that each open the page once (ADR 0083): a link printed in one
//! place opens the page in a browser elsewhere on the machine, its secret
//! traded for the ticket in a `POST`.

use std::sync::Mutex;
use std::time::{Duration, Instant};

/// How long a ticket can be traded for the secret after it is issued.
pub const TICKET_LIFETIME: Duration = Duration::from_secs(60);

/// The tickets issued and not yet traded or expired, held in memory only.
#[derive(Default)]
pub struct Tickets(Mutex<Vec<(String, Instant)>>);

impl Tickets {
    /// A new ticket, 32 random bytes in hex, good until [`TICKET_LIFETIME`]
    /// after `now`.
    pub fn issue(&self, now: Instant) -> String {
        let ticket = super::guard::random_hex();
        let mut issued = self.0.lock().unwrap_or_else(|e| e.into_inner());
        issued.retain(|(_, at)| unexpired(*at, now));
        issued.push((ticket.clone(), now));
        ticket
    }

    /// Whether `ticket` was issued, is unexpired at `now` and untraded;
    /// it is traded either way, so a second try fails.
    pub fn redeem(&self, ticket: &str, now: Instant) -> bool {
        let mut issued = self.0.lock().unwrap_or_else(|e| e.into_inner());
        let found = issued
            .iter()
            .position(|(held, _)| super::guard::matches(held, ticket));
        found.is_some_and(|at| unexpired(issued.swap_remove(at).1, now))
    }
}

/// Whether a ticket issued `at` can still be traded at `now`.
fn unexpired(at: Instant, now: Instant) -> bool {
    now.saturating_duration_since(at) < TICKET_LIFETIME
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_ticket_is_traded_once() {
        let tickets = Tickets::default();
        let now = Instant::now();
        let ticket = tickets.issue(now);
        assert_eq!(ticket.len(), 64);
        assert!(ticket.bytes().all(|b| b.is_ascii_hexdigit()));
        assert!(tickets.redeem(&ticket, now));
        assert!(!tickets.redeem(&ticket, now));
    }

    #[test]
    fn an_expired_ticket_is_refused() {
        let tickets = Tickets::default();
        let now = Instant::now();
        let ticket = tickets.issue(now);
        let just_before = now + TICKET_LIFETIME - Duration::from_millis(1);
        assert!(tickets.redeem(&ticket, just_before));
        let late = tickets.issue(now);
        assert!(!tickets.redeem(&late, now + TICKET_LIFETIME));
    }

    #[test]
    fn an_unknown_ticket_is_refused() {
        let tickets = Tickets::default();
        let now = Instant::now();
        let ticket = tickets.issue(now);
        assert!(!tickets.redeem("", now));
        assert!(!tickets.redeem(&ticket[..63], now));
        assert!(!tickets.redeem(&"0".repeat(64), now));
        assert!(tickets.redeem(&ticket, now));
    }

    #[test]
    fn each_ticket_is_new_and_expired_ones_are_dropped() {
        let tickets = Tickets::default();
        let now = Instant::now();
        let first = tickets.issue(now);
        let second = tickets.issue(now + TICKET_LIFETIME);
        assert_ne!(first, second);
        assert_eq!(tickets.0.lock().unwrap().len(), 1);
    }
}
