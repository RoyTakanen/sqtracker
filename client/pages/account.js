import React, { useState, useContext } from "react";
import getConfig from "next/config";
import { useRouter } from "next/router";
import moment from "moment";
import copy from "copy-to-clipboard";
import jwt from "jsonwebtoken";
import pluralize from "pluralize";
import { ThemeContext } from "styled-components";
import { transparentize } from "polished";
import { Copy } from "@styled-icons/boxicons-regular/Copy";
import { Check } from "@styled-icons/boxicons-regular/Check";
import { X } from "@styled-icons/boxicons-regular/X";
import { withAuthServerSideProps } from "../utils/withAuth";
import SEO from "../components/SEO";
import Box from "../components/Box";
import Text from "../components/Text";
import Infobox from "../components/Infobox";
import Input from "../components/Input";
import Select from "../components/Select";
import Button from "../components/Button";
import List from "../components/List";
import { NotificationContext } from "../components/Notifications";
import Modal from "../components/Modal";
import LoadingContext from "../utils/LoadingContext";

const BuyItem = ({ text, cost, wallet, handleBuy }) => {
  const [amount, setAmount] = useState(1);
  const unavailable = cost === 0;
  const cannotAfford = amount * cost > wallet;
  return (
    <Box
      display="flex"
      flexDirection={["column", "row"]}
      alignItems={["flex-start", "center"]}
      justifyContent="space-between"
      border="1px solid"
      borderColor="border"
      borderRadius={1}
      p={3}
      pl={4}
    >
      <Text mb={[3, 0]} _css={{ whiteSpace: "nowrap" }}>
        {text}
      </Text>
      <Box as="form" onSubmit={handleBuy} width="100%">
        <Box display="flex" alignItems="center" justifyContent="flex-end">
          <Text color="grey" mr={4}>
            {unavailable
              ? "Not available to buy"
              : `Cost: ${amount * cost} points`}
          </Text>
          <Input
            type="number"
            name="amount"
            value={amount}
            onChange={(e) => setAmount(parseInt(e.currentTarget.value))}
            min={1}
            max={Math.floor(wallet / cost)}
            width="100px"
            disabled={unavailable || cannotAfford}
            mr={3}
          />
          <Button disabled={unavailable || cannotAfford}>Buy</Button>
        </Box>
      </Box>
    </Box>
  );
};

const Account = ({ token, invites = [], user, userRole }) => {
  const [remainingInvites, setRemainingInvites] = useState(
    user.remainingInvites ?? 0
  );
  const [invitesList, setInvitesList] = useState(invites);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [bonusPoints, setBonusPoints] = useState(user.bonusPoints ?? 0);
  const [totpEnabled, setTotpEnabled] = useState(user.totp.enabled);
  const [totpQrData, setTotpQrData] = useState();
  const [totpBackupCodes, setTotpBackupCodes] = useState();
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);

  const { addNotification } = useContext(NotificationContext);
  const { setLoading } = useContext(LoadingContext);

  const theme = useContext(ThemeContext);

  const {
    publicRuntimeConfig: {
      SQ_API_URL,
      SQ_BP_EARNED_PER_GB,
      SQ_BP_EARNED_PER_FILLED_REQUEST,
      SQ_BP_COST_PER_INVITE,
      SQ_BP_COST_PER_GB,
      SQ_ALLOW_REGISTER,
    },
  } = getConfig();

  const router = useRouter();

  const handleGenerateInvite = async (e) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.target);

    try {
      const inviteRes = await fetch(`${SQ_API_URL}/account/generate-invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role: form.get("role") || "user",
          email: form.get("email"),
        }),
      });

      if (inviteRes.status !== 200) {
        const reason = await inviteRes.text();
        throw new Error(reason);
      }

      const invite = await inviteRes.json();
      setInvitesList((cur) => {
        const currentInvitesList = [...cur];
        currentInvitesList.unshift(invite);
        return currentInvitesList;
      });

      addNotification("success", "Invite sent successfully");

      setRemainingInvites((r) => r - 1);

      setShowInviteModal(false);
    } catch (e) {
      addNotification("error", `Could not send invite: ${e.message}`);
      console.error(e);
    }

    setLoading(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.target);

    try {
      const changePasswordRes = await fetch(
        `${SQ_API_URL}/account/change-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            password: form.get("password"),
            newPassword: form.get("newPassword"),
          }),
        }
      );

      if (changePasswordRes.status !== 200) {
        const reason = await changePasswordRes.text();
        throw new Error(reason);
      }

      addNotification("success", "Password changed successfully");

      const fields = e.target.querySelectorAll("input");
      for (const field of fields) {
        field.value = "";
        field.blur();
      }
    } catch (e) {
      addNotification("error", `Could not change password: ${e.message}`);
      console.error(e);
    }

    setLoading(false);
  };

  const handleBuy = async (e, type) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.target);

    try {
      const amount = parseInt(form.get("amount"));

      const buyRes = await fetch(`${SQ_API_URL}/account/buy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type,
          amount,
        }),
      });

      if (buyRes.status !== 200) {
        const reason = await buyRes.text();
        throw new Error(reason);
      }

      addNotification("success", "Items purchased successfully");

      const pointsRemaining = await buyRes.text();
      setBonusPoints(parseInt(pointsRemaining));

      if (type === "invite") setRemainingInvites((r) => r + amount);

      const fields = e.target.querySelectorAll("input");
      for (const field of fields) {
        field.value = 1;
        field.blur();
      }
    } catch (e) {
      addNotification("error", `Could not buy items: ${e.message}`);
      console.error(e);
    }

    setLoading(false);
  };

  const handleToggleTotp = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);

    try {
      if (!totpEnabled) {
        const totpToken = form.get("token");

        if (totpToken) {
          const enableRes = await fetch(`${SQ_API_URL}/account/totp/enable`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ token: totpToken }),
          });
          if (enableRes.status === 200) {
            const backupCodes = await enableRes.text();
            setTotpBackupCodes(backupCodes);
            setTotpQrData(undefined);
            setTotpEnabled(true);
            addNotification("success", "2FA enabled");
          } else {
            const message = await enableRes.text();
            addNotification("error", message);
          }
        } else {
          const generateRes = await fetch(
            `${SQ_API_URL}/account/totp/generate`,
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            }
          );
          const totpData = await generateRes.json();
          setTotpQrData(totpData);
        }
      } else {
        const totpToken = form.get("token");

        const disableRes = await fetch(`${SQ_API_URL}/account/totp/disable`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ token: totpToken }),
        });

        if (disableRes.status === 200) {
          setTotpEnabled(false);
          addNotification("success", "2FA disabled");
        } else {
          const message = await disableRes.text();
          addNotification("error", message);
        }
      }
    } catch (e) {
      addNotification("error", `Could not toggle 2FA: ${e.message}`);
      console.error(e);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    const form = new FormData(e.target);

    try {
      const deleteAccountRes = await fetch(`${SQ_API_URL}/account/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          password: form.get("password"),
        }),
      });

      if (deleteAccountRes.status !== 200) {
        const reason = await deleteAccountRes.text();
        throw new Error(reason);
      }

      await router.push("/logout");
    } catch (e) {
      addNotification("error", `Could not delete account: ${e.message}`);
      console.error(e);
    }
  };

  return (
    <>
      <SEO title="My account" />
      <Text as="h1" mb={5}>
        My account
      </Text>
      {userRole === "admin" && (
        <Infobox mb={5}>
          <Text>This is an admin account.</Text>
        </Infobox>
      )}
      <Text as="h2" mb={4}>
        Bonus points
      </Text>
      <Text mb={3}>
        You currently have <strong>{bonusPoints}</strong> bonus points.
      </Text>
      <Box as="ul" mb={4}>
        <Text as="li">
          You will earn <strong>{SQ_BP_EARNED_PER_GB}</strong>{" "}
          {pluralize("point", SQ_BP_EARNED_PER_GB)} for every GB you upload.
        </Text>
        <Text as="li">
          You will earn <strong>{SQ_BP_EARNED_PER_FILLED_REQUEST}</strong>{" "}
          {pluralize("point", SQ_BP_EARNED_PER_FILLED_REQUEST)} for every
          request you fulfill, or{" "}
          <strong>{SQ_BP_EARNED_PER_FILLED_REQUEST * 2}</strong> if you are also
          the uploader of the accepted torrent.
        </Text>
      </Box>
      <Box _css={{ "> * + *": { mt: 3 } }} mb={5}>
        {SQ_ALLOW_REGISTER === "invite" && (
          <BuyItem
            text="Purchase invites"
            cost={SQ_BP_COST_PER_INVITE}
            wallet={bonusPoints}
            handleBuy={(e) => handleBuy(e, "invite")}
          />
        )}
        <BuyItem
          text="Purchase upload (1 GB)"
          cost={SQ_BP_COST_PER_GB}
          wallet={bonusPoints}
          handleBuy={(e) => handleBuy(e, "upload")}
        />
      </Box>
      {SQ_ALLOW_REGISTER === "invite" && (
        <>
          {" "}
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            mb={4}
          >
            <Text as="h2">Invites</Text>
            <Box
              display="flex"
              alignItems="center"
              bg="sidebar"
              borderRadius={1}
              p={2}
              pl={4}
            >
              <Text color="grey" mr={4}>
                {remainingInvites.toLocaleString()} remaining
              </Text>
              <Button
                onClick={() => setShowInviteModal(true)}
                disabled={remainingInvites < 1}
              >
                Send invite
              </Button>
            </Box>
          </Box>
          <List
            data={invitesList}
            columns={[
              {
                header: "Email",
                accessor: "email",
                cell: ({ value }) => <Text>{value}</Text>,
                gridWidth: "1.75fr",
              },
              {
                header: "Claimed",
                accessor: "claimed",
                cell: ({ value }) => (
                  <Box color={value ? "success" : "grey"}>
                    {value ? <Check size={24} /> : <X size={24} />}{" "}
                  </Box>
                ),
                gridWidth: "0.5fr",
              },
              {
                header: "Valid until",
                accessor: "validUntil",
                cell: ({ value }) => (
                  <Text color={value < Date.now() ? "error" : "text"}>
                    {moment(value).format("HH:mm Do MMM YYYY")}
                  </Text>
                ),
                gridWidth: "175px",
              },
              {
                header: "Created",
                accessor: "created",
                cell: ({ value }) => (
                  <Text>{moment(value).format("HH:mm Do MMM YYYY")}</Text>
                ),
                gridWidth: "175px",
              },
              ...(userRole === "admin"
                ? [
                    {
                      header: "Role",
                      accessor: "role",
                      cell: ({ value }) => (
                        <Text _css={{ textTransform: "capitalize" }}>
                          {value}
                        </Text>
                      ),
                      gridWidth: "0.6fr",
                    },
                  ]
                : []),
              {
                header: "Copy link",
                cell: ({ row }) => {
                  return (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        copy(
                          `${location.protocol}//${location.host}/register?token=${row.token}`
                        );
                        addNotification(
                          "success",
                          "Invite link copied to clipboard"
                        );
                      }}
                      disabled={row.claimed || row.validUntil < Date.now()}
                      px={1}
                      py={1}
                    >
                      <Copy size={24} />
                    </Button>
                  );
                },
                rightAlign: true,
                gridWidth: "80px",
              },
            ]}
            mb={5}
          />
        </>
      )}
      <Box mb={5}>
        <Text as="h2" mb={4}>
          Two-factor authentication
        </Text>
        <Text mb={4}>
          Use an authenticator app to add another layer of security to your
          account.
        </Text>
        <form onSubmit={handleToggleTotp}>
          {totpQrData ? (
            <Box display="flex" alignItems="center">
              <Box
                border="1px solid"
                borderColor="border"
                borderRadius={1}
                p={3}
                mr={4}
              >
                <Box
                  as="img"
                  src={totpQrData.qr}
                  width="180px"
                  borderRadius={1}
                  display="block"
                  mx="auto"
                  mb={3}
                />
                <Text color="grey" fontFamily="mono" fontSize={0}>
                  {totpQrData.secret}
                </Text>
              </Box>
              <Box>
                <Text color="grey" mb={4}>
                  Scan the QR code with your authenticator app and enter the
                  one-time code
                </Text>
                <Input
                  name="token"
                  type="number"
                  label="One-time code"
                  width="300px"
                  autoComplete="off"
                  required
                  mb={4}
                />
                <Box display="flex" alignItems="center">
                  <Button mr={3}>Enable 2FA</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setTotpQrData(undefined)}
                  >
                    Cancel
                  </Button>
                </Box>
              </Box>
            </Box>
          ) : (
            <>
              {totpBackupCodes ? (
                <>
                  <Text mb={3}>
                    2FA enabled successfully. These backup codes can be used to
                    log in if you lose access to your authenticator app. Save
                    them now, they will not be visible again.
                  </Text>
                  <Box as="ul">
                    {totpBackupCodes.split(",").map((code) => (
                      <Text
                        as="li"
                        key={`totp-backup-${code}`}
                        fontFamily="mono"
                      >
                        {code}
                      </Text>
                    ))}
                  </Box>
                </>
              ) : (
                <>
                  {totpEnabled && (
                    <Input
                      name="token"
                      type="number"
                      label="One-time code"
                      width="300px"
                      autoComplete="off"
                      required
                      mb={4}
                    />
                  )}
                  <Button>{totpEnabled ? "Disable" : "Enable"} 2FA</Button>
                </>
              )}
            </>
          )}
        </form>
      </Box>
      <Box mb={5}>
        <Text as="h2" mb={4}>
          Change password
        </Text>
        <form onSubmit={handleChangePassword}>
          <Input
            name="password"
            type="password"
            label="Current password"
            mb={4}
            required
          />
          <Input
            name="newPassword"
            type="password"
            label="New password"
            autoComplete="new-password"
            mb={4}
            required
          />
          <Button>Change password</Button>
        </form>
      </Box>
      {user.username !== "admin" && (
        <Box
          bg={transparentize(0.7, theme.colors.error)}
          borderRadius={1}
          p={4}
        >
          <Text as="h2" mb={4}>
            Danger zone
          </Text>
          <Button
            variant="danger"
            onClick={() => setShowDeleteAccountModal(true)}
          >
            Delete my account
          </Button>
        </Box>
      )}
      {showInviteModal && (
        <Modal close={() => setShowInviteModal(false)}>
          <Text mb={5}>
            Enter an email address to send an invite. The invited user will need
            to sign up with the same email address. Once the invite is
            generated, you can also copy a direct invite link.
          </Text>
          <form onSubmit={handleGenerateInvite}>
            <Input name="email" type="email" label="Email" mb={4} required />
            {userRole === "admin" && (
              <Select name="role" mb={4} required>
                <option value="user">Role: user</option>
                <option value="admin">Role: admin</option>
              </Select>
            )}
            <Box display="flex" justifyContent="flex-end">
              <Button
                onClick={() => setShowInviteModal(false)}
                type="button"
                variant="secondary"
                mr={3}
              >
                Cancel
              </Button>
              <Button>Send invite</Button>
            </Box>
          </form>
        </Modal>
      )}
      {showDeleteAccountModal && (
        <Modal close={() => setShowDeleteAccountModal(false)}>
          <Text mb={5}>
            Are you sure you want to delete your account? This action cannot be
            undone, and you may not be able to register again. Your personal
            information will be deleted but your uploaded torrents will remain.
          </Text>
          <form onSubmit={handleDeleteAccount}>
            <Input
              name="password"
              type="password"
              label="Password"
              mb={4}
              required
            />
            <Box display="flex" justifyContent="flex-end">
              <Button
                onClick={() => setShowDeleteAccountModal(false)}
                type="button"
                variant="secondary"
                mr={3}
              >
                Cancel
              </Button>
              <Button variant="danger">Yes, delete my account</Button>
            </Box>
          </form>
        </Modal>
      )}
    </>
  );
};

export const getServerSideProps = withAuthServerSideProps(
  async ({ token, fetchHeaders }) => {
    if (!token) return { props: {} };

    const {
      publicRuntimeConfig: { SQ_API_URL },
      serverRuntimeConfig: { SQ_JWT_SECRET },
    } = getConfig();

    const { role, username } = jwt.verify(token, SQ_JWT_SECRET);

    try {
      const userRes = await fetch(`${SQ_API_URL}/user/${username}`, {
        headers: fetchHeaders,
      });
      if (
        userRes.status === 403 &&
        (await userRes.text()) === "User is banned"
      ) {
        throw "banned";
      }
      const user = await userRes.json();
      const invitesRes = await fetch(`${SQ_API_URL}/account/invites`, {
        headers: fetchHeaders,
      });
      const invites = await invitesRes.json();
      return { props: { invites, user, userRole: role } };
    } catch (e) {
      if (e === "banned") throw "banned";
      return { props: {} };
    }
  }
);

export default Account;
