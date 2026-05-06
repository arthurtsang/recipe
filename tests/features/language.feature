Feature: Language
  As a user, I want to switch between English and Chinese so that I can use the app in my preferred language.

  Scenario: User can switch language from menu
    Given I am logged in
    When I open the user menu
    Then I should see language options
    When I switch to Chinese
    Then the app should display in Chinese
    When I switch back to English
    Then the app should display in English
