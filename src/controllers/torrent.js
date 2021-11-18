import bencode from 'bencode'
import crypto from 'crypto'
import fetch from 'node-fetch'
import Torrent from '../schema/torrent'
import User from '../schema/user'
import Comment from '../schema/comment'
import { hexToBinary } from '../middleware/announce'

export const uploadTorrent = async (req, res) => {
  if (
    req.body.torrent &&
    req.body.name &&
    req.body.description &&
    req.body.type
  ) {
    try {
      const torrent = Buffer.from(req.body.torrent, 'base64')
      const parsed = bencode.decode(torrent)

      if (parsed.info.private !== 1) {
        res.status(400).send('Torrent must be set to private')
        return
      }

      if (!parsed.announce || parsed['announce-list']) {
        res.status(400).send('One and only one announce URL must be set')
        return
      }

      const user = await User.findOne({ _id: req.userId }).lean()

      if (!parsed.announce.toString().endsWith(`/sq/${user.uid}/announce`)) {
        res.status(400).send('Announce URL is invalid')
        return
      }

      const infoHash = crypto
        .createHash('sha1')
        .update(bencode.encode(parsed.info))
        .digest('hex')

      const existingTorrent = await Torrent.findOne({ infoHash }).lean()

      if (existingTorrent) {
        res.status(409).send('Torrent with this info hash already exists')
        return
      }

      const newTorrent = new Torrent({
        name: req.body.name,
        description: req.body.description,
        type: req.body.type,
        infoHash: infoHash,
        binary: req.body.torrent,
        uploadedBy: req.userId,
        downloads: 0,
        anonymous: false,
        created: Date.now(),
      })

      await newTorrent.save()

      res.status(200).send(infoHash)
    } catch (e) {
      res.status(500).send(e.message)
    }
  } else {
    res.sendStatus(400)
  }
}

export const downloadTorrent = async (req, res) => {
  const { infoHash } = req.params
  const { uid } = req.query

  if (!uid) {
    res.status(401).send('Missing user ID')
    return
  }

  const user = await User.findOne({ uid }).lean()

  if (!user) {
    res.status(401).send(`User ID "${uid}" does not exist`)
    return
  }

  const torrent = await Torrent.findOne({ infoHash }).lean()
  const { binary } = torrent
  const parsed = bencode.decode(Buffer.from(binary, 'base64'))

  parsed.announce = `${process.env.SQ_BASE_URL}/sq/${uid}/announce`

  await Torrent.findOneAndUpdate({ infoHash }, { $inc: { downloads: 1 } })

  res.setHeader('Content-Type', 'application/x-bittorrent')
  res.setHeader(
    'Content-Disposition',
    `attachment;filename=${parsed.info.name.toString()}.torrent`
  )
  res.write(bencode.encode(parsed))
  res.end()
}

export const fetchTorrent = async (req, res) => {
  const { infoHash } = req.params

  try {
    const torrent = await Torrent.findOne({ infoHash }).lean()

    if (!torrent) {
      res.status(404).send(`Torrent with info hash ${infoHash} does not exist`)
      return
    }

    const binaryInfoHash = hexToBinary(infoHash)
    const encodedInfoHash = escape(binaryInfoHash)

    const trackerRes = await fetch(
      `${process.env.SQ_TRACKER_URL}/scrape?info_hash=${encodedInfoHash}`
    )

    if (!trackerRes.ok) {
      const body = await trackerRes.text()
      res
        .status(500)
        .send(`Error performing tracker scrape: ${trackerRes.status} ${body}`)
      return
    }

    const bencoded = await trackerRes.text()
    const scrape = bencode.decode(Buffer.from(bencoded, 'binary'))
    const scrapeForInfoHash =
      scrape.files[Buffer.from(binaryInfoHash, 'binary')]

    res.json({
      ...torrent,
      seeders: scrapeForInfoHash?.complete,
      leechers: scrapeForInfoHash?.incomplete,
    })
  } catch (e) {
    res.status(500).send(e.message)
  }
}

export const addComment = async (req, res) => {
  if (req.body.comment) {
    try {
      const { infoHash } = req.params

      const torrent = await Torrent.findOne({ infoHash })

      if (!torrent) {
        res.status(404).send('Torrent does not exist')
        return
      }

      const comment = new Comment({
        torrentId: torrent._id,
        userId: req.userId,
        comment: req.body.comment,
        created: Date.now(),
      })
      await comment.save()

      res.sendStatus(200)
    } catch (err) {
      res.status(500).send(err.message)
    }
  } else {
    res.sendStatus(400)
  }
}
