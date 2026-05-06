Feature: Admin Features
  As an admin user, I want to manage users and view queue status.

  Scenario: Admin can access User Management
    Given I am logged in as admin
    When I open the user menu
    Then I should see "User Management" in the menu
    When I click the "User Management" menu item
    Then I should see the User Management dialog
    And I should see the list of users or empty state

  Scenario: Admin can access Queue Status
    Given I am logged in as admin
    When I open the user menu
    Then I should see "Queue Status" in the menu
    When I click the "Queue Status" menu item
    Then I should see the Queue Status dialog
    And I should see import and recipe analysis queue information
