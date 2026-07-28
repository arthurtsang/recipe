@api
Feature: API health
  Preview environment smoke check (no browser, no Google OAuth).

  Scenario: Health endpoint reports database ok
    When I GET "/api/health"
    Then the response status should be 200
    And the response JSON field "status" should be "ok"
    And the response JSON field "db" should be "ok"
