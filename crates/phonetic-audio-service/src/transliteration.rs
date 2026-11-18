use common::SpanishPhoneticText;
use std::collections::HashMap;

pub struct PhoneticEngine {
    dictionary: HashMap<&'static str, &'static str>,
}

impl PhoneticEngine {
    pub fn new() -> Self {
        let mut dictionary = HashMap::new();
        dictionary.insert("i'm", "aim");
        dictionary.insert("developing", "divélopin");
        dictionary.insert("software", "sofgüer");
        dictionary.insert("in", "in");
        dictionary.insert("rust", "rast");
        dictionary.insert("looking", "lúkin");
        dictionary.insert("for", "for");
        dictionary.insert("a", "a");
        dictionary.insert("backend", "bákend");
        dictionary.insert("developer", "divéloper");
        dictionary.insert("position", "pozíshon");
        dictionary.insert("we", "güi");
        dictionary.insert("refactored", "rifáktord");
        dictionary.insert("the", "da");
        dictionary.insert("monolith", "mónolith");
        dictionary.insert("into", "íntu");
        dictionary.insert("microservices", "máikroservises");
        dictionary.insert("to", "tu");
        dictionary.insert("decrease", "dikrís");
        dictionary.insert("latency", "léitensi");
        dictionary.insert("deploy", "diplói");
        dictionary.insert("hotfix", "jótfiks");
        dictionary.insert("container", "kontéiner");
        dictionary.insert("aws", "ei-dábolyu-es");
        dictionary.insert("kubernetes", "kubernétis");
        dictionary.insert("right", "ráit");
        dictionary.insert("now", "nau");
        dictionary.insert("finished", "fínisht");
        dictionary.insert("authentication", "otentikéishon");
        dictionary.insert("feature", "fíchur");
        dictionary.insert("yesterday", "yésterdei");
        dictionary.insert("today", "tudéi");
        dictionary.insert("reviewing", "riviúin");
        dictionary.insert("pull", "pul");
        dictionary.insert("requests", "rikuésts");

        Self { dictionary }
    }

    pub fn transliterate(&self, english_text: &str) -> SpanishPhoneticText {
        let clean_text = english_text.to_lowercase();
        let words: Vec<&str> = clean_text
            .split_whitespace()
            .map(|w| w.trim_matches(|c: char| !c.is_alphanumeric() && c != '\''))
            .collect();

        let mut phonetic_words = Vec::new();
        for word in words {
            if let Some(&ph) = self.dictionary.get(word) {
                phonetic_words.push(ph.to_string());
            } else {
                let mut fallback = word.replace("ing", "in").replace("tion", "shon");
                if fallback.is_empty() {
                    fallback = word.to_string();
                }
                phonetic_words.push(fallback);
            }
        }

        if let Some(first) = phonetic_words.first_mut() {
            let mut chars = first.chars();
            if let Some(c) = chars.next() {
                *first = format!("{}{}", c.to_uppercase(), chars.as_str());
            }
        }

        SpanishPhoneticText::new(phonetic_words.join(" "))
            .unwrap_or_else(|_| SpanishPhoneticText::new("Sin transliteración").unwrap())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transliteration_rust_developer() {
        let engine = PhoneticEngine::new();
        let res = engine.transliterate("I'm developing software in Rust.");
        assert_eq!(res.as_str(), "Aim divélopin sofgüer in rast");
    }

    #[test]
    fn test_transliteration_backend_position() {
        let engine = PhoneticEngine::new();
        let res = engine.transliterate("I'm looking for a backend developer position.");
        assert_eq!(res.as_str(), "Aim lúkin for a bákend divéloper pozíshon");
    }
}
