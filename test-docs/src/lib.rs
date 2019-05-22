//! The point of this crate is to be able to have enough different "kinds" of
//! documentation generated so we can test each different features.

use std::fmt;

/// Basic function with some code examples:
///
/// ```
/// println!("nothing fancy");
/// ```
///
/// A failing to compile one:
///
/// ```compile-fail
/// println!("where did my argument {} go? :'(");
/// ```
///
/// An ignored one:
///
/// ```ignore
/// Let's say I'm just some text will ya?
/// ```
pub fn foo() {}

/// Just a normal struct.
pub struct Foo;

/// Just a normal enum.
pub enum WhoLetTheDogOut {
    /// Woof!
    Woof,
    /// Meoooooooow...
    Meow,
}

/// Who doesn't love to wrap a `format!` call?
pub fn some_more_function<T: fmt::Debug>(t: &T) -> String {
    format!("{:?}", t)
}

/// Woohoo! A trait!
pub trait AnotherOne {
    /// Some func 1.
    fn func1();

    /// Some func 2.
    fn func2();

    /// Some func 3.
    fn func3();
}
