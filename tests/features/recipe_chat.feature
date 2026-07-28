@browser @legacy
Feature: Recipe Chat
  As a logged-in user, I want to chat with the recipe assistant for cooking help.

  Scenario: User can open the chat dialog
    Given I am logged in
    When I click the chat floating action button
    Then I should see the Recipe Assistant chat dialog
    And I should see the welcome message from the bot

  Scenario: User can send a message and get a response
    Given I am logged in
    And I have opened the chat
    When I type "What can I make with chicken?" in the chat
    And I send the chat message
    Then I should see my message in the chat
    And I should receive a response from the bot

  Scenario: User can use suggested questions
    Given I am logged in
    And I have opened the chat
    When I click a suggested question chip
    Then the question should appear in the chat input
    And I can send it to get a response
